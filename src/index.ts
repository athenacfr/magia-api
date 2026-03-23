// Public API
export { defineConfig } from "./config";
export { createMagia } from "./proxy";
export { tanstackQuery } from "./plugins/tanstack-query";

// Types — used in magia.gen.ts and user code
export type {
  // Config
  DefineConfigInput,
  ApiDefConfig,
  RestApiDefConfig,
  GraphQLApiDefConfig,
  SchemaSource,
  SchemaScript,
  // Runtime
  MagiaClient,
  MagiaConfig,
  MagiaApiConfig,
  MagiaPlugin,
  MagiaFetchOptions,
  MagiaRawResponse,
  // Operation types (used in module augmentation)
  MagiaOperation,
  MagiaMutation,
  MagiaTanStackQuery,
  MagiaTanStackMutation,
  MagiaTanStackInfiniteQuery,
  // Manifest (used in magia.gen.ts)
  Manifest,
  ManifestApi,
  ManifestEntry,
  ParamLocation,
} from "./types";
