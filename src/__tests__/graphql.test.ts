import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, rmSync, mkdirSync, mkdtempSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse } from "graphql";
import { extractGraphQLOperations } from "../codegen/graphql-codegen";
import { generate } from "../codegen/index";
import { createMagia } from "../proxy";
import { MagiaError } from "../error";
import type { Manifest, MagiaConfig } from "../types";

const SCHEMA_PATH = join(__dirname, "fixtures", "graphql", "schema.graphql");
const OPS_PATH = join(__dirname, "fixtures", "graphql", "operations.graphql");

// ---------------------------------------------------------------------------
// GraphQL operation extraction
// ---------------------------------------------------------------------------

describe("extractGraphQLOperations", () => {
  const rawSDL = readFileSync(OPS_PATH, "utf-8");
  const document = parse(rawSDL);

  it("extracts all named operations", () => {
    const ops = extractGraphQLOperations([{ document, rawSDL }]);
    expect(ops).toHaveLength(3);

    const names = ops.map((o) => o.operationName);
    expect(names).toContain("GetUser");
    expect(names).toContain("ListUsers");
    expect(names).toContain("CreateUser");
  });

  it("identifies operation kinds", () => {
    const ops = extractGraphQLOperations([{ document, rawSDL }]);

    const getUser = ops.find((o) => o.operationName === "GetUser")!;
    expect(getUser.kind).toBe("query");

    const createUser = ops.find((o) => o.operationName === "CreateUser")!;
    expect(createUser.kind).toBe("mutation");
  });

  it("preserves document strings", () => {
    const ops = extractGraphQLOperations([{ document, rawSDL }]);
    for (const op of ops) {
      expect(op.document).toBeTruthy();
      expect(typeof op.document).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// GraphQL full pipeline
// ---------------------------------------------------------------------------

describe("generate (GraphQL pipeline)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-gql-"));
    mkdirSync(join(tmpDir, "src"));
    mkdirSync(join(tmpDir, "node_modules"));
    mkdirSync(join(tmpDir, "graphql"), { recursive: true });
    copyFileSync(SCHEMA_PATH, join(tmpDir, "schema.graphql"));
    copyFileSync(OPS_PATH, join(tmpDir, "graphql", "operations.graphql"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates magia.gen.ts from GraphQL schema + documents", async () => {
    const result = await generate({
      config: {
        output: "./src/magia.gen.ts",
        apis: {
          cms: {
            type: "graphql",
            schema: "./schema.graphql",
            documents: "./graphql/**/*.graphql",
          },
        },
      },
      cwd: tmpDir,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.apis.cms).toBeDefined();
    expect(result.apis.cms.operations).toBe(3);

    // Read generated file
    const source = readFileSync(result.genFilePath, "utf-8");

    // Has manifest with GraphQL entries
    expect(source).toContain("export const manifest: Manifest");
    expect(source).toContain('"GetUser"');
    expect(source).toContain('"ListUsers"');
    expect(source).toContain('"CreateUser"');
    expect(source).toContain('type: "graphql"');
    expect(source).toContain('kind: "query"');
    expect(source).toContain('kind: "mutation"');
    expect(source).toContain("document:");

    // Has module augmentation
    expect(source).toContain("declare module 'magia-api'");
    expect(source).toContain("GetUser: MagiaOperation");
    expect(source).toContain("CreateUser: MagiaMutation");

    // Has type references
    expect(source).toContain("cmsTypes.");
  }, 30000);

  it("generates mixed REST + GraphQL", async () => {
    // Also copy petstore fixture
    const petstorePath = join(__dirname, "fixtures", "petstore-mini.json");
    copyFileSync(petstorePath, join(tmpDir, "petstore.json"));

    const result = await generate({
      config: {
        output: "./src/magia.gen.ts",
        apis: {
          petstore: {
            type: "rest",
            schema: "./petstore.json",
          },
          cms: {
            type: "graphql",
            schema: "./schema.graphql",
            documents: "./graphql/**/*.graphql",
          },
        },
      },
      cwd: tmpDir,
    });

    expect(result.errors).toHaveLength(0);
    expect(result.apis.petstore.operations).toBe(5);
    expect(result.apis.cms.operations).toBe(3);

    const source = readFileSync(result.genFilePath, "utf-8");

    // Both APIs in manifest
    expect(source).toContain('"petstore"');
    expect(source).toContain('"cms"');
    expect(source).toContain('type: "rest"');
    expect(source).toContain('type: "graphql"');

    // Both APIs in module augmentation
    expect(source).toContain("petstore: {");
    expect(source).toContain("cms: {");
    expect(source).toContain("FlatInput<"); // REST helper
  }, 60000);
});

// ---------------------------------------------------------------------------
// GraphQL proxy dispatch
// ---------------------------------------------------------------------------

describe("GraphQL proxy dispatch", () => {
  const manifest: Manifest = {
    cms: {
      plugins: [],
      operations: {
        GetUser: {
          type: "graphql",
          kind: "query",
          document: "query GetUser($id: ID!) { user(id: $id) { id name } }",
        },
        CreateUser: {
          type: "graphql",
          kind: "mutation",
          document:
            "mutation CreateUser($input: CreateUserInput!) { createUser(input: $input) { id } }",
        },
      },
    },
  };

  const config: MagiaConfig = {
    apis: {
      cms: { baseUrl: "https://api.example.com/graphql" },
    },
  };

  function mockGqlFetch(data: unknown) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: () => Promise.resolve({ data }),
    });
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST with query and variables", async () => {
    const fetch = mockGqlFetch({ user: { id: "1", name: "Alice" } });
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    const result = await magia.cms.GetUser.fetch({ id: "1" });

    expect(result).toEqual({ user: { id: "1", name: "Alice" } });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.example.com/graphql");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.query).toContain("query GetUser");
    expect(body.variables).toEqual({ id: "1" });
  });

  it("sends mutation", async () => {
    const fetch = mockGqlFetch({ createUser: { id: "2" } });
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    const result = await magia.cms.CreateUser.fetch({
      input: { name: "Bob", email: "bob@example.com" },
    });

    expect(result).toEqual({ createUser: { id: "2" } });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.query).toContain("mutation CreateUser");
    expect(body.variables.input.name).toBe("Bob");
  });

  it("omits variables when input is empty", async () => {
    const fetch = mockGqlFetch({ users: [] });
    globalThis.fetch = fetch;

    const manifest2: Manifest = {
      cms: {
        plugins: [],
        operations: {
          ListUsers: {
            type: "graphql",
            kind: "query",
            document: "query ListUsers { users { id name } }",
          },
        },
      },
    };

    const magia = createMagia(config, manifest2) as any;
    await magia.cms.ListUsers.fetch();

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.variables).toBeUndefined();
  });

  it("throws MagiaError on GraphQL errors in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: () =>
        Promise.resolve({
          data: null,
          errors: [
            {
              message: "User not found",
              extensions: { code: "NOT_FOUND", status: 404 },
            },
          ],
        }),
    });

    const magia = createMagia(config, manifest) as any;

    try {
      await magia.cms.GetUser.fetch({ id: "999" });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MagiaError);
      const e = err as MagiaError;
      expect(e.message).toBe("User not found");
      expect(e.status).toBe(404);
      expect(e.code).toBe("NOT_FOUND");
      expect(e.api).toBe("cms");
      expect(e.operation).toBe("GetUser");
      expect(e.isNotFound()).toBe(true);
    }
  });

  it("throws MagiaError on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "internal" }),
    });

    const magia = createMagia(config, manifest) as any;
    await expect(magia.cms.GetUser.fetch({ id: "1" })).rejects.toThrow(MagiaError);
  });

  it("throws MagiaError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const magia = createMagia(config, manifest) as any;

    try {
      await magia.cms.GetUser.fetch({ id: "1" });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e.isNetworkError()).toBe(true);
      expect(e.api).toBe("cms");
      expect(e.operation).toBe("GetUser");
    }
  });
});
