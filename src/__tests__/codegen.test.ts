import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { copyFileSync } from "node:fs";
import { parseSpec } from "../codegen/parser";
import { extractOperations } from "../codegen/extractor";
import { generateGenFile } from "../codegen/gen-file";

function mockExportedTypes(ops: { operationName: string }[]): Set<string> {
  const types = new Set<string>();
  for (const op of ops) {
    const cap = op.operationName[0].toUpperCase() + op.operationName.slice(1);
    types.add(`${cap}Data`);
    types.add(`${cap}Response`);
  }
  return types;
}
import { generate } from "../codegen/index";

const FIXTURE_PATH = join(__dirname, "fixtures", "petstore-mini.json");
const FIXTURE_TEXT = readFileSync(FIXTURE_PATH, "utf-8");

// -----------------------------------------------------------------------
// Parser tests
// -----------------------------------------------------------------------

describe("parseSpec", () => {
  it("parses JSON OpenAPI spec", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Petstore Mini");
    expect(Object.keys(spec.paths!)).toHaveLength(3);
  });

  it("parses YAML OpenAPI spec", () => {
    const yaml = `
openapi: "3.0.3"
info:
  title: Test
  version: "1.0"
paths:
  /hello:
    get:
      operationId: sayHello
      responses:
        "200":
          description: OK
`;
    const spec = parseSpec(yaml);
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.paths!["/hello"].get!.operationId).toBe("sayHello");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseSpec("{invalid")).toThrow("Failed to parse");
  });

  it("throws on missing openapi field", () => {
    expect(() => parseSpec('{"info": {}}')).toThrow('Missing or invalid "openapi"');
  });

  it("throws on unsupported version", () => {
    expect(() => parseSpec('{"openapi": "2.0"}')).toThrow("Only 3.x is supported");
  });
});

// -----------------------------------------------------------------------
// Extractor tests
// -----------------------------------------------------------------------

describe("extractOperations", () => {
  const spec = parseSpec(FIXTURE_TEXT);

  it("extracts all operations", () => {
    const ops = extractOperations(spec);
    expect(ops).toHaveLength(5);
    const names = ops.map((o) => o.operationName);
    expect(names).toContain("getPetById");
    expect(names).toContain("deletePet");
    expect(names).toContain("addPet");
    expect(names).toContain("updatePet");
    expect(names).toContain("findPetsByStatus");
  });

  it("maps path params correctly", () => {
    const ops = extractOperations(spec);
    const getPet = ops.find((o) => o.operationName === "getPetById")!;
    expect(getPet.entry.method).toBe("GET");
    expect(getPet.entry.path).toBe("/pet/{petId}");
    expect(getPet.entry.params).toEqual({ petId: "path" });
  });

  it("maps query params correctly", () => {
    const ops = extractOperations(spec);
    const findByStatus = ops.find((o) => o.operationName === "findPetsByStatus")!;
    expect(findByStatus.entry.params).toEqual({ status: "query" });
  });

  it("maps requestBody as body param", () => {
    const ops = extractOperations(spec);
    const addPet = ops.find((o) => o.operationName === "addPet")!;
    expect(addPet.entry.method).toBe("POST");
    expect(addPet.entry.params).toEqual({ body: "body" });
  });

  it("uses custom operationName function", () => {
    const ops = extractOperations(spec, {
      operationName: (method, path, opId) => `${method.toLowerCase()}_${opId}`,
    });
    const names = ops.map((o) => o.operationName);
    expect(names).toContain("get_getPetById");
    expect(names).toContain("post_addPet");
  });

  it("generates fallback name when no operationId", () => {
    const specNoId = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/users/{userId}/posts": {
            get: {
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specNoId);
    expect(ops).toHaveLength(1);
    expect(ops[0].operationName).toMatch(/get/i);
    expect(ops[0].operationName).toMatch(/users/i);
  });
});

// -----------------------------------------------------------------------
// Gen file tests
// -----------------------------------------------------------------------

describe("generateGenFile", () => {
  it("generates manifest + module augmentation in one file", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    const ops = extractOperations(spec);
    const source = generateGenFile({
      petstore: {
        operations: ops,
        plugins: [{ name: "tanstackQuery" }],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes: mockExportedTypes(ops),
      },
    });

    // Has manifest
    expect(source).toContain("export const manifest: Manifest");
    expect(source).toContain('"getPetById"');
    expect(source).toContain('"GET"');
    expect(source).toContain("/pet/{petId}");

    // Has module augmentation
    expect(source).toContain("declare module 'magia-api'");
    expect(source).toContain("interface MagiaClient");
    expect(source).toContain("getPetById: MagiaOperation");
    expect(source).toContain("addPet: MagiaMutation");
    expect(source).toContain("MagiaTanStackQuery");
    expect(source).toContain("MagiaTanStackMutation");
    expect(source).toContain("pathKey(): readonly ['magia', 'petstore']");

    // Has imports
    expect(source).toContain(
      "import type * as petstoreTypes from '../node_modules/.magia/internals/petstore'",
    );
    expect(source).toContain("import type { Manifest, MagiaOperation, MagiaMutation");
  });

  it("omits TQ types when plugin not configured", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    const ops = extractOperations(spec);
    const source = generateGenFile({
      petstore: {
        operations: ops,
        plugins: [],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes: mockExportedTypes(ops),
      },
    });

    expect(source).not.toContain("MagiaTanStackQuery");
    expect(source).not.toContain("MagiaTanStackMutation");
  });
});

// -----------------------------------------------------------------------
// Full pipeline integration test
// -----------------------------------------------------------------------

describe("generate (full pipeline)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-codegen-"));
    mkdirSync(join(tmpDir, "src"));
    mkdirSync(join(tmpDir, "node_modules"));
    copyFileSync(FIXTURE_PATH, join(tmpDir, "petstore.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates magia.gen.ts from petstore spec", async () => {
    const result = await generate({
      config: {
        output: "./src/magia.gen.ts",
        apis: {
          petstore: {
            type: "rest",
            schema: "./petstore.json",
            plugins: [{ name: "tanstackQuery" }],
          },
        },
      },
      cwd: tmpDir,
    });

    // No errors
    expect(result.errors).toHaveLength(0);

    // Single gen file at src/magia.gen.ts
    expect(result.genFilePath).toBeTruthy();
    expect(result.genFilePath).toContain("magia.gen.ts");
    expect(existsSync(result.genFilePath)).toBe(true);

    const source = readFileSync(result.genFilePath, "utf-8");

    // Has manifest
    expect(source).toContain("export const manifest: Manifest");
    expect(source).toContain('"getPetById"');
    expect(source).toContain('"addPet"');
    expect(source).toContain("tanstackQuery");

    // Has module augmentation
    expect(source).toContain("declare module 'magia-api'");
    expect(source).toContain("MagiaOperation");
    expect(source).toContain("MagiaTanStackQuery");

    // API stats
    expect(result.apis.petstore.operations).toBe(5);
  }, 30000);

  it("reports error for GraphQL API in v1", async () => {
    const result = await generate({
      config: {
        output: "./src/magia.gen.ts",
        apis: {
          github: {
            type: "graphql" as any,
            schema: "./schema.graphql",
            documents: "./src/**/*.graphql",
          },
        },
      },
      cwd: tmpDir,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].apiName).toBe("github");
    expect(result.errors[0].error.message).toContain("not supported in v1");
  });
}, 60000);
