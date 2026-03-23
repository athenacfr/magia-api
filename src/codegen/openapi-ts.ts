import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

export interface OpenApiTSOptions {
  /** API name (used for output subdirectory) */
  apiName: string;
  /** Raw OpenAPI spec text (JSON or YAML) */
  specText: string;
  /** Base output directory (e.g. node_modules/.magia) */
  outputDir: string;
}

/**
 * Run openapi-typescript to generate TypeScript types from an OpenAPI spec.
 * Generates a single .d.ts file with paths, components, and operations interfaces.
 */
export async function generateTypes(opts: OpenApiTSOptions): Promise<string> {
  const typesDir = resolve(opts.outputDir, "internals", opts.apiName);
  await mkdir(typesDir, { recursive: true });

  const ast = await openapiTS(opts.specText);
  const output = astToString(ast);

  // Write the generated types as a .ts file (contains export interfaces)
  const typesPath = resolve(typesDir, "types.ts");
  await writeFile(typesPath, output, "utf-8");

  // Write a re-export index
  const indexContent = `export * from "./types";\n`;
  await writeFile(resolve(typesDir, "index.ts"), indexContent, "utf-8");

  return typesDir;
}
