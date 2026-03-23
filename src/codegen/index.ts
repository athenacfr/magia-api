import { resolve, relative, dirname } from "node:path";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";

import type { DefineConfigInput, MagiaPlugin, GraphQLApiDefConfig } from "../types";
import { resolveSchema } from "../schema";
import { parseSpec } from "./parser";
import { extractOperations, type ExtractedOperation } from "./extractor";
import { generateTypes, writeSpecFile } from "./hey-api";
import { generateGraphQLTypes, type GraphQLExtractedOperation } from "./graphql-codegen";
import { generateGenFile } from "./gen-file";

export interface GenerateOptions {
  config: DefineConfigInput;
  cwd?: string;
  /** Only generate these APIs (default: all) */
  filter?: string[];
}

export interface GenerateResult {
  genFilePath: string;
  apis: Record<string, { operations: number; typesDir: string }>;
  errors: Array<{ apiName: string; error: Error }>;
}

function resolveGenFilePath(cwd: string, config: DefineConfigInput): string {
  return resolve(cwd, config.output);
}

/**
 * Write a file atomically (write to temp, then rename).
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Gen API info types (union for REST and GraphQL)
// ---------------------------------------------------------------------------

type GenApiInfo =
  | {
      apiType: "rest";
      operations: ExtractedOperation[];
      plugins: MagiaPlugin[];
      typesImportPath: string;
      exportedTypes: Set<string>;
    }
  | {
      apiType: "graphql";
      operations: GraphQLExtractedOperation[];
      plugins: MagiaPlugin[];
      typesImportPath: string;
      exportedTypes: Set<string>;
    };

// ---------------------------------------------------------------------------
// REST pipeline
// ---------------------------------------------------------------------------

async function generateRestApi(
  apiName: string,
  apiConfig: { schema: any; plugins?: MagiaPlugin[]; operationName?: any },
  cwd: string,
  outputDir: string,
  genFilePath: string,
): Promise<{ genApi: GenApiInfo; operationCount: number; typesDir: string }> {
  // 1. Resolve schema
  const specText = await resolveSchema({
    apiName,
    source: apiConfig.schema,
    cwd,
  });

  // 2. Parse spec
  const spec = parseSpec(specText);

  // 3. Extract operations
  const operations = extractOperations(spec, {
    operationName: apiConfig.operationName,
  });

  // 4. Write spec file for Hey API
  const specPath = await writeSpecFile(outputDir, apiName, specText);

  // 5. Generate types via Hey API
  let typesDir: string;
  try {
    typesDir = await generateTypes({
      apiName,
      specPath,
      outputDir,
    });
  } catch (heyApiErr) {
    const msg = heyApiErr instanceof Error ? heyApiErr.message : String(heyApiErr);
    const isCircularRef = /circular|\$ref.*loop|recursive/i.test(msg);
    throw new Error(
      isCircularRef
        ? `API "${apiName}" has circular $ref in schema. ` +
            `Hey API cannot resolve circular references. ` +
            `Consider simplifying the schema or breaking the cycle.`
        : `Hey API type generation failed for "${apiName}": ${msg}`,
      { cause: heyApiErr },
    );
  }

  // 6. Scan Hey API output for available type names
  const indexContent = await readFile(resolve(typesDir, "index.ts"), "utf-8");
  const exportedTypes = new Set(
    [...indexContent.matchAll(/\b(\w+(?:Data|Response|Errors))\b/g)].map((m) => m[1]),
  );

  // 7. Collect for gen file
  const plugins = apiConfig.plugins ?? [];
  const typesRelative = relative(dirname(genFilePath), typesDir).replace(/\\/g, "/");
  const typesImportPath = typesRelative.startsWith(".") ? typesRelative : `./${typesRelative}`;

  return {
    genApi: { apiType: "rest", operations, plugins, typesImportPath, exportedTypes },
    operationCount: operations.length,
    typesDir,
  };
}

// ---------------------------------------------------------------------------
// GraphQL pipeline
// ---------------------------------------------------------------------------

async function generateGraphQLApi(
  apiName: string,
  apiConfig: GraphQLApiDefConfig,
  cwd: string,
  outputDir: string,
  genFilePath: string,
): Promise<{ genApi: GenApiInfo; operationCount: number; typesDir: string }> {
  // 1. Resolve schema
  const schemaText = await resolveSchema({
    apiName,
    source: apiConfig.schema,
    cwd,
  });

  // 2. Generate types via graphql-codegen + extract operations
  const { typesDir, operations, exportedTypes } = await generateGraphQLTypes({
    apiName,
    schemaText,
    documentGlobs: apiConfig.documents,
    outputDir,
    cwd,
  });

  // 3. Collect for gen file
  const plugins = apiConfig.plugins ?? [];
  const typesRelative = relative(dirname(genFilePath), typesDir).replace(/\\/g, "/");
  const typesImportPath = typesRelative.startsWith(".") ? typesRelative : `./${typesRelative}`;

  return {
    genApi: { apiType: "graphql", operations, plugins, typesImportPath, exportedTypes },
    operationCount: operations.length,
    typesDir,
  };
}

// ---------------------------------------------------------------------------
// Main generate function
// ---------------------------------------------------------------------------

/**
 * Run the full codegen pipeline for all APIs in the config.
 */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const cwd = opts.cwd ?? process.cwd();
  const outputDir = resolve(cwd, "node_modules", ".magia");
  await mkdir(outputDir, { recursive: true });

  const genFilePath = resolveGenFilePath(cwd, opts.config);
  const apiNames = opts.filter ?? Object.keys(opts.config.apis);
  const genApis: Record<string, GenApiInfo> = {};
  const result: GenerateResult = {
    genFilePath: "",
    apis: {},
    errors: [],
  };

  for (const apiName of apiNames) {
    const apiConfig = opts.config.apis[apiName];
    if (!apiConfig) {
      result.errors.push({ apiName, error: new Error(`API "${apiName}" not found in config`) });
      continue;
    }

    try {
      if (apiConfig.type === "rest") {
        const { genApi, operationCount, typesDir } = await generateRestApi(
          apiName,
          apiConfig,
          cwd,
          outputDir,
          genFilePath,
        );
        genApis[apiName] = genApi;
        result.apis[apiName] = { operations: operationCount, typesDir };
      } else if (apiConfig.type === "graphql") {
        const { genApi, operationCount, typesDir } = await generateGraphQLApi(
          apiName,
          apiConfig,
          cwd,
          outputDir,
          genFilePath,
        );
        genApis[apiName] = genApi;
        result.apis[apiName] = { operations: operationCount, typesDir };
      } else {
        result.errors.push({
          apiName,
          error: new Error(`Unknown API type: "${(apiConfig as any).type}"`),
        });
      }
    } catch (err) {
      result.errors.push({
        apiName,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  // Generate magia.gen.ts (manifest + type augmentation)
  if (Object.keys(genApis).length > 0) {
    const source = generateGenFile(genApis);
    await atomicWrite(genFilePath, source);
    result.genFilePath = genFilePath;
  }

  return result;
}
