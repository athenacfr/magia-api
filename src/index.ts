export type {
  // defineConfig types
  DefineConfigInput,
  ApiDefConfig,
  RestApiDefConfig,
  GraphQLApiDefConfig,
  SchemaSource,
  SchemaScript,
  // Runtime types
  MagiaClient,
  MagiaConfig,
  MagiaApiConfig,
  MagiaPlugin,
  MagiaPluginOptions,
  TanStackQueryPluginOptions,
  MagiaFetchOptions,
  MagiaRawResponse,
  // Operation types (.d.ts augmentation)
  MagiaOperation,
  MagiaMutation,
  MagiaTanStackQuery,
  MagiaTanStackMutation,
  MagiaTanStackInfiniteQuery,
  // Manifest (internal)
  Manifest,
  ManifestApi,
  ManifestEntry,
  ParamLocation,
} from './types'

export { defineConfig } from './config'
export { createMagia } from './proxy'
export { tanstackQuery } from './plugins/tanstack-query'
export { findConfigFile, loadConfig, resolveConfig } from './loader'
