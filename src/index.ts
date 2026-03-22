export type {
  MagiaClient,
  MagiaConfig,
  MagiaApiConfig,
  MagiaPlugin,
  MagiaPluginOptions,
  TanStackQueryPluginOptions,
  MagiaFetchOptions,
  MagiaRawResponse,
  MagiaOperation,
  MagiaMutation,
  MagiaTanStackQuery,
  MagiaTanStackMutation,
  MagiaTanStackInfiniteQuery,
  Manifest,
  ManifestApi,
  ManifestEntry,
  ParamLocation,
} from './types'

export { createMagia } from './proxy'
export { tanstackQuery } from './plugins/tanstack-query'
