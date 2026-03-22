import type { Manifest, MagiaConfig, MagiaFetchOptions } from '../types'
import { dispatch } from '../proxy'

export interface TanStackQueryPlugin {
  /** Extend the Proxy with queryOptions/queryKey/mutationOptions/mutationKey */
  extendProxy(
    path: string[],
    prop: string,
    config: MagiaConfig,
    manifest: Manifest,
  ): unknown | undefined
}

export function tanstackQuery(): TanStackQueryPlugin {
  return {
    extendProxy(path, prop, config, manifest) {
      // Operation level: path = [apiName, operationName]
      if (path.length === 2) {
        const [apiName, operationName] = path

        if (prop === 'queryOptions') {
          return (input?: Record<string, unknown>, opts?: { signal?: AbortSignal }) => ({
            queryKey: input != null
              ? (['magia', apiName, operationName, input] as const)
              : (['magia', apiName, operationName] as const),
            queryFn: (ctx: { signal: AbortSignal }) =>
              dispatch(config, apiName, operationName, manifest, input, {
                signal: ctx.signal,
              }),
          })
        }

        if (prop === 'queryKey') {
          return (input?: Record<string, unknown>) =>
            input != null
              ? (['magia', apiName, operationName, input] as const)
              : (['magia', apiName, operationName] as const)
        }

        if (prop === 'mutationOptions') {
          return (opts?: {
            onSuccess?: (data: unknown, variables: unknown) => void
            onError?: (error: Error, variables: unknown) => void
          }) => ({
            mutationFn: (input: Record<string, unknown>) =>
              dispatch(config, apiName, operationName, manifest, input),
            mutationKey: ['magia', apiName, operationName] as const,
            ...opts,
          })
        }

        if (prop === 'mutationKey') {
          return () => ['magia', apiName, operationName] as const
        }
      }

      return undefined
    },
  }
}
