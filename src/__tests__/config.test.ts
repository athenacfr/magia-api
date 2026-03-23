import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { defineConfig } from "../config";
import { findConfigFile, loadConfig, resolveConfig } from "../loader";

describe("defineConfig", () => {
  it("returns the config as-is (identity function)", () => {
    const input = {
      output: "./src/magia.gen.ts",
      apis: {
        petstore: {
          type: "rest" as const,
          schema: "https://petstore.example.com/openapi.json",
          plugins: [{ name: "tanstackQuery" }],
        },
      },
    };

    const result = defineConfig(input);
    expect(result).toBe(input); // same reference
  });

  it("accepts all schema source types", () => {
    const config = defineConfig({
      apis: {
        urlSchema: {
          type: "rest",
          schema: "https://example.com/spec.json",
        },
        fileSchema: {
          type: "rest",
          schema: "./schemas/local.yaml",
        },
        asyncSchema: {
          type: "rest",
          schema: async () => '{"openapi":"3.0.0"}',
        },
        scriptSchema: {
          type: "rest",
          schema: { command: "./fetch.sh", output: "./out.json" },
        },
        graphql: {
          type: "graphql",
          schema: "https://api.example.com/graphql",
          documents: "./src/**/*.graphql",
        },
        graphqlMultiDocs: {
          type: "graphql",
          schema: "./schema.graphql",
          documents: ["./src/queries/**/*.graphql", "./src/mutations/**/*.graphql"],
        },
      },
      output: "./src/api/magia.gen.ts",
    });

    expect(Object.keys(config.apis)).toHaveLength(6);
    expect(config.output).toBe("./src/api/magia.gen.ts");
  });

  it("accepts optional per-API config fields", () => {
    const config = defineConfig({
      output: "./src/magia.gen.ts",
      apis: {
        test: {
          type: "rest",
          schema: "./spec.json",
          schemaWatch: false,
          schemaCache: { ttl: "30m" },
          operationName: (method, path, opId) => opId ?? `${method}_${path}`,
        },
      },
    });

    expect(config.apis.test.schemaWatch).toBe(false);
    expect(config.apis.test.schemaCache).toEqual({ ttl: "30m" });
    expect(config.apis.test.operationName).toBeTypeOf("function");
  });
});

describe("findConfigFile", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds magia.config.ts in cwd", () => {
    writeFileSync(join(tmpDir, "magia.config.ts"), "export default {}");
    expect(findConfigFile(tmpDir)).toBe(join(tmpDir, "magia.config.ts"));
  });

  it("finds magia.config.js as fallback", () => {
    writeFileSync(join(tmpDir, "magia.config.js"), "export default {}");
    expect(findConfigFile(tmpDir)).toBe(join(tmpDir, "magia.config.js"));
  });

  it("prefers .ts over .js", () => {
    writeFileSync(join(tmpDir, "magia.config.ts"), "export default {}");
    writeFileSync(join(tmpDir, "magia.config.js"), "export default {}");
    expect(findConfigFile(tmpDir)).toBe(join(tmpDir, "magia.config.ts"));
  });

  it("searches parent directories", () => {
    const nested = join(tmpDir, "a", "b", "c");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(tmpDir, "magia.config.ts"), "export default {}");
    expect(findConfigFile(nested)).toBe(join(tmpDir, "magia.config.ts"));
  });

  it("returns null when no config found", () => {
    expect(findConfigFile(tmpDir)).toBeNull();
  });
});

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads a JS config file with default export", async () => {
    const configPath = join(tmpDir, "magia.config.mjs");
    writeFileSync(
      configPath,
      `export default { apis: { test: { type: 'rest', schema: './spec.json' } } }`,
    );

    const config = await loadConfig(configPath);
    expect(config.apis.test.type).toBe("rest");
  });

  it("throws when no default export with apis field", async () => {
    const configPath = join(tmpDir, "magia.config.mjs");
    writeFileSync(configPath, `export const foo = 'bar'`);

    await expect(loadConfig(configPath)).rejects.toThrow("'apis' field");
  });
});

describe("resolveConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds and loads config from cwd", async () => {
    const configPath = join(tmpDir, "magia.config.mjs");
    writeFileSync(
      configPath,
      `export default { apis: { pet: { type: 'rest', schema: './s.json' } } }`,
    );

    const { config, configPath: foundPath } = await resolveConfig(tmpDir);
    expect(foundPath).toBe(configPath);
    expect(config.apis.pet.type).toBe("rest");
  });

  it("throws when no config file found", async () => {
    await expect(resolveConfig(tmpDir)).rejects.toThrow("Could not find");
  });
});
