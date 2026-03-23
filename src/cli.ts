#!/usr/bin/env node

import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "generate") {
    const flags = args.filter((a) => a.startsWith("-"));
    const filter = args.slice(1).filter((a) => !a.startsWith("-"));
    const force = flags.includes("--force");
    await runGenerate(filter.length > 0 ? filter : undefined, force);
  } else if (command === "validate") {
    await runValidate();
  } else if (command === "init") {
    await runInit();
  } else if (command === "--help" || command === "-h") {
    printHelp();
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}

function printHelp() {
  console.log(
    `
magia-api — Zero-ceremony typed API client generation

Usage:
  magia-api generate [api...] [--force]   Generate types and manifest (default)
  magia-api validate                      Validate config and schemas
  magia-api init                          Scaffold a magia.config.ts
  magia-api --help                        Show this help

Options:
  --force    Force regeneration (ignore cache)

Examples:
  magia-api generate             Generate all APIs (skip unchanged)
  magia-api generate --force     Regenerate all APIs
  magia-api generate petstore    Generate only petstore
  magia-api validate             Check config and schema validity
  magia-api init                 Create starter config
  magia-api                      Same as 'generate'
`.trim(),
  );
}

async function runGenerate(filter?: string[], force?: boolean) {
  const startTime = Date.now();

  try {
    const { config, configPath } = await resolveConfig();
    console.log(`Config: ${configPath}`);

    const result = await generate({ config, filter, force });

    // Report results
    for (const [apiName, api] of Object.entries(result.apis)) {
      console.log(`  ${apiName}: ${api.operations} operations`);
    }

    // Report skipped
    for (const apiName of result.skipped) {
      console.log(`  ${apiName}: unchanged (skipped)`);
    }

    // Report errors
    for (const { apiName, error } of result.errors) {
      console.error(`  ${apiName}: ERROR — ${error.message}`);
    }

    if (result.genFilePath) {
      console.log(`Generated: ${result.genFilePath}`);
    }

    const elapsed = Date.now() - startTime;
    console.log(`Done in ${elapsed}ms`);

    if (result.errors.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function runValidate() {
  try {
    const { config, configPath } = await resolveConfig();
    console.log(`Config: ${configPath}`);

    const apiNames = Object.keys(config.apis);
    if (apiNames.length === 0) {
      console.error("No APIs defined in config");
      process.exit(1);
    }

    let hasErrors = false;

    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      // Validate type
      if (!["rest", "graphql"].includes(apiConfig.type)) {
        console.error(`  ${apiName}: invalid type "${apiConfig.type}"`);
        hasErrors = true;
        continue;
      }

      // Validate GraphQL has documents
      if (apiConfig.type === "graphql" && !("documents" in apiConfig)) {
        console.error(`  ${apiName}: GraphQL API missing 'documents' field`);
        hasErrors = true;
        continue;
      }

      // Try resolving schema
      const { resolveSchema } = await import("./schema");
      try {
        const cwd = process.cwd();
        const schemaText = await resolveSchema({ apiName, source: apiConfig.schema, cwd });
        if (!schemaText || schemaText.trim().length === 0) {
          console.error(`  ${apiName}: schema resolved to empty content`);
          hasErrors = true;
          continue;
        }

        // Try parsing (REST only — validate OpenAPI structure)
        if (apiConfig.type === "rest") {
          const { parseSpec } = await import("./codegen/parser");
          const spec = parseSpec(schemaText);
          const pathCount = Object.keys(spec.paths ?? {}).length;
          console.log(`  ${apiName}: valid (${pathCount} paths)`);
        } else {
          console.log(`  ${apiName}: valid (schema resolved)`);
        }
      } catch (err) {
        console.error(`  ${apiName}: ${err instanceof Error ? err.message : String(err)}`);
        hasErrors = true;
      }
    }

    if (hasErrors) {
      process.exit(1);
    } else {
      console.log(`All ${apiNames.length} API(s) valid`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

async function runInit() {
  const { existsSync, writeFileSync } = await import("node:fs");
  const configName = "magia.config.ts";

  if (existsSync(configName)) {
    console.error(`${configName} already exists`);
    process.exit(1);
  }

  const template = `import { defineConfig } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    // example: {
    //   type: "rest",
    //   schema: "https://petstore3.swagger.io/api/v3/openapi.json",
    //   plugins: [tanstackQuery()],
    // },
  },
});
`;

  writeFileSync(configName, template, "utf-8");
  console.log(`Created ${configName}`);
}

main();
