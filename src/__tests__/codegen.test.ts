import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { copyFileSync } from "node:fs";
import { parseSpec } from "../codegen/parser";
import { extractOperations } from "../codegen/extractor";
import { generateGenFile } from "../codegen/gen-file";

/** Mock exported types as openapi-typescript generates them — operationId keys in operations interface */
function mockExportedTypes(ops: { operationName: string }[]): Set<string> {
  const types = new Set<string>();
  for (const op of ops) {
    types.add(op.operationName);
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

  it("extracts header params", () => {
    const specWithHeaders = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/pets": {
            get: {
              operationId: "listPets",
              parameters: [
                { name: "X-Api-Key", in: "header", required: true, schema: { type: "string" } },
                { name: "status", in: "query", schema: { type: "string" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specWithHeaders);
    expect(ops).toHaveLength(1);
    expect(ops[0].entry.params).toEqual({
      "X-Api-Key": "header",
      status: "query",
    });
  });

  it("detects multipart/form-data request body", () => {
    const specMultipart = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/pet/{petId}/uploadImage": {
            post: {
              operationId: "uploadPetImage",
              parameters: [
                { name: "petId", in: "path", required: true, schema: { type: "integer" } },
              ],
              requestBody: {
                content: {
                  "multipart/form-data": {
                    schema: {
                      type: "object",
                      properties: { file: { type: "string", format: "binary" } },
                    },
                  },
                },
              },
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specMultipart);
    expect(ops).toHaveLength(1);
    expect(ops[0].entry.multipart).toBe(true);
  });

  it("detects SSE endpoints from text/event-stream response", () => {
    const specSSE = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/chat/stream": {
            post: {
              operationId: "streamChat",
              requestBody: { content: { "application/json": { schema: {} } } },
              responses: {
                "200": {
                  description: "SSE stream",
                  content: { "text/event-stream": { schema: { type: "string" } } },
                },
              },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specSSE);
    expect(ops).toHaveLength(1);
    expect(ops[0].entry.sse).toBe(true);
  });

  it("detects offset/limit pagination", () => {
    const specPaginated = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              parameters: [
                { name: "offset", in: "query", schema: { type: "integer" } },
                { name: "limit", in: "query", schema: { type: "integer" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specPaginated);
    expect(ops[0].entry.pagination).toEqual({
      style: "offset",
      pageParam: "offset",
      sizeParam: "limit",
    });
  });

  it("detects cursor pagination", () => {
    const specCursor = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              parameters: [
                { name: "cursor", in: "query", schema: { type: "string" } },
                { name: "limit", in: "query", schema: { type: "integer" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specCursor);
    expect(ops[0].entry.pagination).toEqual({
      style: "cursor",
      pageParam: "cursor",
    });
  });

  it("detects page/pageSize pagination", () => {
    const specPage = parseSpec(
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: {
          "/items": {
            get: {
              operationId: "listItems",
              parameters: [
                { name: "page", in: "query", schema: { type: "integer" } },
                { name: "pageSize", in: "query", schema: { type: "integer" } },
              ],
              responses: { "200": { description: "OK" } },
            },
          },
        },
      }),
    );
    const ops = extractOperations(specPage);
    expect(ops[0].entry.pagination).toEqual({
      style: "page",
      pageParam: "page",
      sizeParam: "pageSize",
    });
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
        apiType: "rest",
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
    expect(source).toContain("import type { Manifest, ManifestApi, MagiaOperation, MagiaMutation");
  });

  it("includes error types extracted from operations interface", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    const ops = extractOperations(spec);
    const exportedTypes = mockExportedTypes(ops);

    const source = generateGenFile({
      petstore: {
        apiType: "rest",
        operations: ops,
        plugins: [],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes,
      },
    });

    // Error types extracted from operations[opId]["responses"] via ErrorResponses<T>
    expect(source).toContain("ErrorResponses<");
    expect(source).toContain('petstoreTypes.operations["getPetById"]');
  });

  it("uses empty errors when operation not in exportedTypes", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    const ops = extractOperations(spec);
    // Empty exported types — simulates no operations interface
    const source = generateGenFile({
      petstore: {
        apiType: "rest",
        operations: ops,
        plugins: [],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes: new Set<string>(),
      },
    });

    // Should use void/{} for types when operation not found
    expect(source).toContain("MagiaOperation<void, void, {}>");
    // But should still have MagiaError in imports
    expect(source).toContain("MagiaError");
  });

  it("emits MagiaSSEOperation for SSE endpoints", () => {
    const source = generateGenFile({
      ai: {
        apiType: "rest",
        operations: [
          {
            operationName: "streamChat",
            entry: {
              type: "rest",
              method: "POST",
              path: "/chat/stream",
              params: { body: "body" },
              sse: true,
            },
          },
        ],
        plugins: [],
        typesImportPath: "../node_modules/.magia/internals/ai",
        exportedTypes: new Set(["StreamChatData", "StreamChatResponse"]),
      },
    });

    expect(source).toContain("MagiaSSEOperation");
    expect(source).toContain("streamChat: MagiaSSEOperation");
    // SSE ops should NOT have MagiaOperation or MagiaMutation
    expect(source).not.toContain("streamChat: MagiaOperation");
  });

  it("emits MagiaTanStackInfiniteQuery for paginated endpoints", () => {
    const source = generateGenFile({
      petstore: {
        apiType: "rest",
        operations: [
          {
            operationName: "listPets",
            entry: {
              type: "rest",
              method: "GET",
              path: "/pets",
              params: { offset: "query", limit: "query" },
              pagination: { style: "offset", pageParam: "offset", sizeParam: "limit" },
            },
          },
        ],
        plugins: [{ name: "tanstackQuery" }],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes: new Set(["ListPetsData", "ListPetsResponse"]),
      },
    });

    expect(source).toContain("MagiaTanStackInfiniteQuery");
    expect(source).toContain("listPets: MagiaOperation");
    expect(source).toContain("& MagiaTanStackInfiniteQuery");
  });

  it("emits multipart and pagination in manifest", () => {
    const source = generateGenFile({
      petstore: {
        apiType: "rest",
        operations: [
          {
            operationName: "uploadImage",
            entry: {
              type: "rest",
              method: "POST",
              path: "/pet/{petId}/uploadImage",
              params: { petId: "path", body: "body" },
              multipart: true,
            },
          },
        ],
        plugins: [],
        typesImportPath: "../node_modules/.magia/internals/petstore",
        exportedTypes: new Set(["UploadImageData", "UploadImageResponse"]),
      },
    });

    expect(source).toContain("multipart: true");
  });

  it("omits TQ types when plugin not configured", () => {
    const spec = parseSpec(FIXTURE_TEXT);
    const ops = extractOperations(spec);
    const source = generateGenFile({
      petstore: {
        apiType: "rest",
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

  it("reports error for unknown API type", async () => {
    const result = await generate({
      config: {
        output: "./src/magia.gen.ts",
        apis: {
          test: {
            type: "grpc" as any,
            schema: "./spec.proto",
          },
        },
      },
      cwd: tmpDir,
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].apiName).toBe("test");
    expect(result.errors[0].error.message).toContain("Unknown API type");
  });
}, 60000);
