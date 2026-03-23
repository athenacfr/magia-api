import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { mkdir, writeFile } from "node:fs/promises";
import { codegen } from "@graphql-codegen/core";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import * as typescriptOperationsPlugin from "@graphql-codegen/typescript-operations";
import { parse, type DocumentNode } from "graphql";
import { glob } from "../glob";
import type { GraphQLManifestEntry } from "../types";

export interface GraphQLCodegenOptions {
  apiName: string;
  /** GraphQL schema text (SDL) */
  schemaText: string;
  /** Glob patterns for .graphql document files */
  documentGlobs: string | string[];
  /** Base output directory (e.g. node_modules/.magia) */
  outputDir: string;
  /** Working directory for resolving globs */
  cwd: string;
}

export interface GraphQLExtractedOperation {
  operationName: string;
  kind: "query" | "mutation" | "subscription";
  document: string;
}

/**
 * Load and parse all .graphql document files matching the given globs.
 */
async function loadDocuments(
  globs: string | string[],
  cwd: string,
): Promise<Array<{ document: DocumentNode; rawSDL: string; location: string }>> {
  const patterns = Array.isArray(globs) ? globs : [globs];
  const files = await glob(patterns, cwd);

  const documents = [];
  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const document = parse(content);
    documents.push({ document, rawSDL: content, location: file });
  }

  return documents;
}

/**
 * Extract operation info from parsed GraphQL documents.
 */
export function extractGraphQLOperations(
  documents: Array<{ document: DocumentNode; rawSDL: string }>,
): GraphQLExtractedOperation[] {
  const operations: GraphQLExtractedOperation[] = [];

  for (const { document, rawSDL } of documents) {
    for (const def of document.definitions) {
      if (def.kind === "OperationDefinition" && def.name) {
        operations.push({
          operationName: def.name.value,
          kind: def.operation,
          document: rawSDL.trim(),
        });
      }
    }
  }

  return operations;
}

/**
 * Run graphql-codegen to generate TypeScript types from schema + documents.
 * Returns the path to the generated types file.
 */
export async function generateGraphQLTypes(opts: GraphQLCodegenOptions): Promise<{
  typesDir: string;
  operations: GraphQLExtractedOperation[];
  exportedTypes: Set<string>;
}> {
  const typesDir = resolve(opts.outputDir, "internals", opts.apiName);
  await mkdir(typesDir, { recursive: true });

  // Parse schema as DocumentNode (don't build GraphQLSchema to avoid cross-module issues)
  const schemaDocumentNode = parse(opts.schemaText);

  // Load documents
  const docs = await loadDocuments(opts.documentGlobs, opts.cwd);
  if (docs.length === 0) {
    throw new Error(
      `No .graphql documents found for "${opts.apiName}". ` +
        `Check the "documents" glob in your config.`,
    );
  }

  // Extract operations for manifest
  const operations = extractGraphQLOperations(docs);
  if (operations.length === 0) {
    throw new Error(
      `No named operations found in documents for "${opts.apiName}". ` +
        `Make sure your .graphql files contain named queries/mutations.`,
    );
  }

  // Generate types via graphql-codegen
  const output = await codegen({
    schema: schemaDocumentNode,
    documents: docs.map((d) => ({ document: d.document, location: d.location })),
    filename: resolve(typesDir, "types.gen.ts"),
    plugins: [{ typescript: {} }, { "typescript-operations": {} }],
    pluginMap: {
      typescript: typescriptPlugin,
      "typescript-operations": typescriptOperationsPlugin,
    },
    config: {
      // Opinionated defaults for magia
      skipTypename: true,
      enumsAsTypes: true,
      avoidOptionals: false,
    },
  });

  // Write types file
  const typesPath = resolve(typesDir, "types.gen.ts");
  await writeFile(typesPath, output, "utf-8");

  // Write index.ts that re-exports
  const indexPath = resolve(typesDir, "index.ts");
  await writeFile(indexPath, `export * from './types.gen';\n`, "utf-8");

  // Extract exported type names for gen-file verification
  const exportedTypes = new Set([...output.matchAll(/export\s+type\s+(\w+)/g)].map((m) => m[1]));

  return { typesDir, operations, exportedTypes };
}
