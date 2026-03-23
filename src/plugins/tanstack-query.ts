import type { MagiaConfig, ManifestEntry } from "../types";
import { dispatch, dispatchSubscribe } from "../proxy";

/**
 * Compile-time plugin marker for defineConfig().
 * Tells codegen to generate TanStack Query types and mark the API
 * in the manifest with plugins: ['tanstackQuery'].
 */
export function tanstackQuery() {
  return { name: "tanstackQuery" as const };
}

// ---------------------------------------------------------------------------
// Runtime TQ methods — called by the Proxy when manifest has 'tanstackQuery'
// ---------------------------------------------------------------------------

export function resolveTanStackQueryProp(
  path: string[],
  prop: string,
  config: MagiaConfig,
): unknown | undefined {
  if (path.length !== 2) return undefined;

  const [apiName, operationName] = path;

  if (prop === "queryOptions") {
    return (input?: Record<string, unknown>) => ({
      queryKey:
        input != null
          ? (["magia", apiName, operationName, input] as const)
          : (["magia", apiName, operationName] as const),
      queryFn: (ctx: { signal: AbortSignal }) =>
        dispatch(config, apiName, operationName, input, {
          signal: ctx.signal,
        }),
    });
  }

  if (prop === "queryKey") {
    return (input?: Record<string, unknown>) =>
      input != null
        ? (["magia", apiName, operationName, input] as const)
        : (["magia", apiName, operationName] as const);
  }

  if (prop === "mutationOptions") {
    return (opts?: {
      onSuccess?: (data: unknown, variables: unknown) => void;
      onError?: (error: Error, variables: unknown) => void;
    }) => ({
      mutationFn: (input: Record<string, unknown>) =>
        dispatch(config, apiName, operationName, input),
      mutationKey: ["magia", apiName, operationName] as const,
      ...opts,
    });
  }

  if (prop === "mutationKey") {
    return () => ["magia", apiName, operationName] as const;
  }

  if (prop === "infiniteQueryOptions") {
    const apiManifest = config.manifest[apiName];
    const entry: ManifestEntry | undefined = apiManifest?.operations[operationName];
    const pagination = entry && "pagination" in entry ? entry.pagination : undefined;

    return (
      input?: Record<string, unknown>,
      opts?: { getNextPageParam?: (lastPage: unknown) => unknown },
    ) => ({
      queryKey:
        input != null
          ? (["magia", apiName, operationName, input] as const)
          : (["magia", apiName, operationName] as const),
      queryFn: (ctx: { signal: AbortSignal; pageParam: unknown }) => {
        const mergedInput = { ...input };
        // Merge pageParam into the correct input field based on pagination metadata
        if (ctx.pageParam != null && pagination) {
          mergedInput[pagination.pageParam] = ctx.pageParam;
        }
        return dispatch(config, apiName, operationName, mergedInput, {
          signal: ctx.signal,
        });
      },
      initialPageParam:
        pagination?.style === "page" ? 1 : pagination?.style === "offset" ? 0 : undefined,
      ...(opts?.getNextPageParam ? { getNextPageParam: opts.getNextPageParam } : {}),
    });
  }

  if (prop === "subscriptionOptions") {
    return (input?: Record<string, unknown>, _opts?: { signal?: AbortSignal }) => ({
      queryKey:
        input != null
          ? (["magia", apiName, operationName, input] as const)
          : (["magia", apiName, operationName] as const),
      queryFn: (ctx: { signal: AbortSignal }) =>
        dispatchSubscribe(config, apiName, operationName, input, {
          signal: ctx.signal,
        }),
    });
  }

  if (prop === "subscriptionKey") {
    return (input?: Record<string, unknown>) =>
      input != null
        ? (["magia", apiName, operationName, input] as const)
        : (["magia", apiName, operationName] as const);
  }

  return undefined;
}
