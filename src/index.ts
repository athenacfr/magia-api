export type {
  MagiaClient,
  MagiaConfig,
  MagiaApiConfig,
  MagiaFetchOptions,
  MagiaRawResponse,
  MagiaOperation,
  MagiaMutation,
  MagiaTanStackQuery,
  MagiaTanStackMutation,
  MagiaTanStackInfiniteQuery,
  Manifest,
  ManifestEntry,
  ParamLocation,
} from './types'

export { createMagia } from './proxy'
export { tanstackQuery } from './plugins/tanstack-query'
