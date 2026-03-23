import { describe, it, expectTypeOf } from "vitest";
import type {
  MagiaConfig,
  MagiaApiConfig,
  Manifest,
  MagiaOperation,
  MagiaMutation,
  MagiaTanStackQuery,
  MagiaTanStackMutation,
  MagiaFetchOptions,
  MagiaRawResponse,
  MagiaClient,
  DefineConfigInput,
  ApiDefConfig,
  RestApiDefConfig,
  GraphQLApiDefConfig,
  SchemaSource,
  SchemaScript,
  MagiaPlugin,
} from "../types";
import { MagiaError } from "../error";
import { createMagia } from "../proxy";
import { defineConfig } from "../config";
import { tanstackQuery } from "../plugins/tanstack-query";

// ---------------------------------------------------------------------------
// MagiaConfig — apis keys constrained to manifest keys
// ---------------------------------------------------------------------------

describe("MagiaConfig type safety", () => {
  it("requires apis keys to match manifest keys", () => {
    const manifest = {
      petstore: {
        plugins: [] as MagiaPlugin[],
        operations: {},
      },
      users: {
        plugins: [] as MagiaPlugin[],
        operations: {},
      },
    } satisfies Manifest;

    type M = typeof manifest;

    // apis must have both petstore and users
    type Config = MagiaConfig<M>;
    expectTypeOf<Config["apis"]>().toEqualTypeOf<{
      petstore: MagiaApiConfig;
      users: MagiaApiConfig;
    }>();
  });

  it("manifest field is required", () => {
    expectTypeOf<MagiaConfig>().toHaveProperty("manifest");
    expectTypeOf<MagiaConfig>().toHaveProperty("apis");
  });

  it("onError is optional", () => {
    type OnError = MagiaConfig["onError"];
    expectTypeOf<OnError>().toEqualTypeOf<((error: MagiaError) => void) | undefined>();
  });
});

// ---------------------------------------------------------------------------
// MagiaApiConfig
// ---------------------------------------------------------------------------

describe("MagiaApiConfig type", () => {
  it("requires baseUrl", () => {
    expectTypeOf<MagiaApiConfig>().toHaveProperty("baseUrl");
    expectTypeOf<MagiaApiConfig["baseUrl"]>().toBeString();
  });

  it("accepts static, sync, and async headers", () => {
    const staticHeaders: MagiaApiConfig = {
      baseUrl: "/api",
      fetchOptions: { headers: { "X-Key": "abc" } },
    };
    const syncHeaders: MagiaApiConfig = {
      baseUrl: "/api",
      fetchOptions: { headers: () => ({ Authorization: "Bearer x" }) },
    };
    const asyncHeaders: MagiaApiConfig = {
      baseUrl: "/api",
      fetchOptions: { headers: async () => ({ Authorization: "Bearer x" }) },
    };

    expectTypeOf(staticHeaders).toMatchTypeOf<MagiaApiConfig>();
    expectTypeOf(syncHeaders).toMatchTypeOf<MagiaApiConfig>();
    expectTypeOf(asyncHeaders).toMatchTypeOf<MagiaApiConfig>();
  });
});

// ---------------------------------------------------------------------------
// MagiaOperation & MagiaMutation
// ---------------------------------------------------------------------------

describe("Operation types", () => {
  it("MagiaOperation has fetch and isError", () => {
    type Op = MagiaOperation<{ id: number }, { name: string }, { 404: { message: string } }>;

    expectTypeOf<Op["fetch"]>().toBeFunction();
    expectTypeOf<Op["isError"]>().toBeFunction();
  });

  it("MagiaMutation has fetch and isError", () => {
    type Mut = MagiaMutation<{ name: string }, { id: number }>;

    expectTypeOf<Mut["fetch"]>().toBeFunction();
    expectTypeOf<Mut["isError"]>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// TanStack Query types
// ---------------------------------------------------------------------------

describe("TanStack Query types", () => {
  it("MagiaTanStackQuery has queryOptions and queryKey", () => {
    type TQ = MagiaTanStackQuery<{ id: number }, { name: string }>;

    expectTypeOf<TQ["queryOptions"]>().toBeFunction();
    expectTypeOf<TQ["queryKey"]>().toBeFunction();
  });

  it("MagiaTanStackMutation has mutationOptions and mutationKey", () => {
    type TM = MagiaTanStackMutation<{ name: string }, { id: number }>;

    expectTypeOf<TM["mutationOptions"]>().toBeFunction();
    expectTypeOf<TM["mutationKey"]>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// MagiaFetchOptions & MagiaRawResponse
// ---------------------------------------------------------------------------

describe("Fetch types", () => {
  it("MagiaFetchOptions fields are optional", () => {
    const opts: MagiaFetchOptions = {};
    expectTypeOf(opts).toMatchTypeOf<MagiaFetchOptions>();
  });

  it("MagiaRawResponse has data, headers, status", () => {
    type Raw = MagiaRawResponse<{ name: string }>;

    expectTypeOf<Raw["data"]>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<Raw["status"]>().toBeNumber();
  });
});

// ---------------------------------------------------------------------------
// MagiaError
// ---------------------------------------------------------------------------

describe("MagiaError type", () => {
  it("extends Error", () => {
    expectTypeOf<MagiaError>().toMatchTypeOf<Error>();
  });

  it("has all expected properties", () => {
    expectTypeOf<MagiaError>().toHaveProperty("status");
    expectTypeOf<MagiaError>().toHaveProperty("code");
    expectTypeOf<MagiaError>().toHaveProperty("api");
    expectTypeOf<MagiaError>().toHaveProperty("operation");
    expectTypeOf<MagiaError>().toHaveProperty("data");
  });

  it("has helper methods", () => {
    expectTypeOf<MagiaError["isNotFound"]>().toBeFunction();
    expectTypeOf<MagiaError["isAuthError"]>().toBeFunction();
    expectTypeOf<MagiaError["isNetworkError"]>().toBeFunction();
    expectTypeOf<MagiaError["isTimeout"]>().toBeFunction();
    expectTypeOf<MagiaError["isServerError"]>().toBeFunction();
    expectTypeOf<MagiaError["isValidationError"]>().toBeFunction();
  });
});

// ---------------------------------------------------------------------------
// defineConfig
// ---------------------------------------------------------------------------

describe("defineConfig types", () => {
  it("returns DefineConfigInput", () => {
    const config = defineConfig({
      output: "src/magia.gen.ts",
      apis: {
        petstore: { type: "rest", schema: "./spec.json" },
      },
    });

    expectTypeOf(config).toMatchTypeOf<DefineConfigInput>();
  });

  it("accepts all schema source types", () => {
    expectTypeOf<string>().toMatchTypeOf<SchemaSource>();
    expectTypeOf<() => Promise<string>>().toMatchTypeOf<SchemaSource>();
    expectTypeOf<SchemaScript>().toMatchTypeOf<SchemaSource>();
  });

  it("distinguishes REST and GraphQL configs", () => {
    expectTypeOf<RestApiDefConfig>().toMatchTypeOf<ApiDefConfig>();
    expectTypeOf<GraphQLApiDefConfig>().toMatchTypeOf<ApiDefConfig>();
  });

  it("GraphQL requires documents", () => {
    expectTypeOf<GraphQLApiDefConfig>().toHaveProperty("documents");
  });
});

// ---------------------------------------------------------------------------
// tanstackQuery plugin
// ---------------------------------------------------------------------------

describe("tanstackQuery plugin", () => {
  it("returns a MagiaPlugin", () => {
    const plugin = tanstackQuery();
    expectTypeOf(plugin).toMatchTypeOf<MagiaPlugin>();
    expectTypeOf(plugin.name).toEqualTypeOf<"tanstackQuery">();
  });
});

// ---------------------------------------------------------------------------
// createMagia
// ---------------------------------------------------------------------------

describe("createMagia types", () => {
  it("returns MagiaClient", () => {
    const manifest: Manifest = {
      petstore: { plugins: [], operations: {} },
    };

    const magia = createMagia({
      manifest,
      apis: { petstore: { baseUrl: "/api" } },
    });

    expectTypeOf(magia).toMatchTypeOf<MagiaClient>();
  });
});
