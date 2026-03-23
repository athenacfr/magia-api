import type {
  Manifest,
  ManifestEntry,
  RestManifestEntry,
  GraphQLManifestEntry,
  MagiaConfig,
  MagiaFetchOptions,
} from "./types";
import { MagiaError } from "./error";
import { resolveTanStackQueryProp } from "./plugins/tanstack-query";

// ---------------------------------------------------------------------------
// URL construction (REST)
// ---------------------------------------------------------------------------

function buildUrl(
  baseUrl: string,
  entry: RestManifestEntry,
  flatInput: Record<string, unknown>,
  extraQuery?: Record<string, unknown>,
): string {
  // Substitute path params: /pet/{petId} → /pet/1
  let url = entry.path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const val = flatInput[key];
    if (val == null) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(String(val));
  });

  // Collect query params
  const query: Record<string, string> = {};
  for (const [key, location] of Object.entries(entry.params)) {
    if (location === "query" && flatInput[key] != null) {
      query[key] = String(flatInput[key]);
    }
  }
  if (extraQuery) {
    for (const [key, val] of Object.entries(extraQuery)) {
      if (val != null) query[key] = String(val);
    }
  }

  const qs = new URLSearchParams(query).toString();
  if (qs) url += `?${qs}`;

  return `${baseUrl}${url}`;
}

// ---------------------------------------------------------------------------
// Body extraction (REST)
// ---------------------------------------------------------------------------

function extractBody(
  entry: RestManifestEntry,
  flatInput: Record<string, unknown>,
): unknown | undefined {
  const bodyKeys = Object.entries(entry.params)
    .filter(([, loc]) => loc === "body")
    .map(([key]) => key);

  if (bodyKeys.length === 0) return undefined;

  // If there's a single "body" key, send the whole input minus path/query params
  if (bodyKeys.length === 1 && bodyKeys[0] === "body") {
    const pathAndQueryKeys = new Set(
      Object.entries(entry.params)
        .filter(([, loc]) => loc !== "body")
        .map(([key]) => key),
    );
    const body: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(flatInput)) {
      if (!pathAndQueryKeys.has(key)) {
        body[key] = val;
      }
    }
    return body;
  }

  // Otherwise, pick only declared body params
  const body: Record<string, unknown> = {};
  for (const key of bodyKeys) {
    if (flatInput[key] != null) body[key] = flatInput[key];
  }
  return body;
}

// ---------------------------------------------------------------------------
// Header extraction from flat input (REST)
// ---------------------------------------------------------------------------

function extractHeaders(
  entry: RestManifestEntry,
  flatInput: Record<string, unknown>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, location] of Object.entries(entry.params)) {
    if (location === "header" && flatInput[key] != null) {
      headers[key] = String(flatInput[key]);
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Resolve headers (static or async function)
// ---------------------------------------------------------------------------

async function resolveHeaders(
  config: MagiaConfig["apis"][string],
): Promise<Record<string, string>> {
  const h = config.fetchOptions?.headers;
  if (!h) return {};
  if (typeof h === "function") return await h();
  return h;
}

// ---------------------------------------------------------------------------
// REST dispatch
// ---------------------------------------------------------------------------

async function dispatchRest(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  entry: RestManifestEntry,
  apiConfig: MagiaConfig["apis"][string],
  input: Record<string, unknown>,
  opts: MagiaFetchOptions,
): Promise<unknown> {
  const url = buildUrl(apiConfig.baseUrl, entry, input, opts.query);
  const body = extractBody(entry, input);
  const configHeaders = await resolveHeaders(apiConfig);
  const inputHeaders = extractHeaders(entry, input);

  let response: Response;
  try {
    response = await fetch(url, {
      method: entry.method,
      headers: {
        ...(body != null ? { "Content-Type": "application/json" } : {}),
        ...configHeaders,
        ...inputHeaders,
        ...opts.headers,
      },
      body: body != null ? JSON.stringify(body) : undefined,
      signal: opts.signal,
    });
  } catch (fetchErr) {
    const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
    const error = new MagiaError(
      isAbort
        ? `${entry.method} ${entry.path} was aborted`
        : `${entry.method} ${entry.path} network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
      {
        status: 0,
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        api: apiName,
        operation: operationName,
        data: undefined,
      },
    );
    config.onError?.(error);
    throw error;
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = undefined;
    }
    const error = new MagiaError(`${entry.method} ${entry.path} failed with ${response.status}`, {
      status: response.status,
      code: String(response.status),
      api: apiName,
      operation: operationName,
      data: errorData,
      response,
    });
    config.onError?.(error);
    throw error;
  }

  const data = await response.json();

  if (opts.raw) {
    return { data, headers: response.headers, status: response.status };
  }

  return data;
}

// ---------------------------------------------------------------------------
// GraphQL dispatch
// ---------------------------------------------------------------------------

async function dispatchGraphQL(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  entry: GraphQLManifestEntry,
  apiConfig: MagiaConfig["apis"][string],
  input: Record<string, unknown>,
  opts: MagiaFetchOptions,
): Promise<unknown> {
  const url = apiConfig.baseUrl;
  const configHeaders = await resolveHeaders(apiConfig);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...configHeaders,
        ...opts.headers,
      },
      body: JSON.stringify({
        query: entry.document,
        variables: Object.keys(input).length > 0 ? input : undefined,
      }),
      signal: opts.signal,
    });
  } catch (fetchErr) {
    const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
    const error = new MagiaError(
      isAbort
        ? `GraphQL ${operationName} was aborted`
        : `GraphQL ${operationName} network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
      {
        status: 0,
        code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
        api: apiName,
        operation: operationName,
        data: undefined,
      },
    );
    config.onError?.(error);
    throw error;
  }

  if (!response.ok) {
    let errorData: unknown;
    try {
      errorData = await response.json();
    } catch {
      errorData = undefined;
    }
    const error = new MagiaError(`GraphQL ${operationName} failed with ${response.status}`, {
      status: response.status,
      code: String(response.status),
      api: apiName,
      operation: operationName,
      data: errorData,
      response,
    });
    config.onError?.(error);
    throw error;
  }

  const json = (await response.json()) as { data?: unknown; errors?: unknown[] };

  // GraphQL errors in response body
  if (json.errors && Array.isArray(json.errors) && json.errors.length > 0) {
    const firstErr = json.errors[0] as Record<string, unknown>;
    const extensions = (firstErr.extensions ?? {}) as Record<string, unknown>;
    const error = new MagiaError(
      (firstErr.message as string) ?? `GraphQL ${operationName} returned errors`,
      {
        status: (extensions.status as number) ?? 200,
        code: (extensions.code as string) ?? "GRAPHQL_ERROR",
        api: apiName,
        operation: operationName,
        data: json.errors,
        response,
      },
    );
    config.onError?.(error);
    throw error;
  }

  if (opts.raw) {
    return { data: json.data, headers: response.headers, status: response.status };
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Unified dispatch
// ---------------------------------------------------------------------------

async function dispatch(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  manifest: Manifest,
  input: Record<string, unknown> = {},
  opts: MagiaFetchOptions = {},
): Promise<unknown> {
  const apiManifest = manifest[apiName];
  if (!apiManifest) throw new Error(`Unknown API: ${apiName}`);

  const entry = apiManifest.operations[operationName];
  if (!entry) throw new Error(`Unknown operation: ${apiName}.${operationName}`);

  const apiConfig = config.apis[apiName];
  if (!apiConfig) throw new Error(`No config for API: ${apiName}`);

  if (entry.type === "graphql") {
    return dispatchGraphQL(config, apiName, operationName, entry, apiConfig, input, opts);
  }

  return dispatchRest(config, apiName, operationName, entry, apiConfig, input, opts);
}

// ---------------------------------------------------------------------------
// Recursive Proxy
// ---------------------------------------------------------------------------

function createProxy(config: MagiaConfig, manifest: Manifest, path: string[]): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string) {
      if (prop === "then") return undefined; // not a thenable

      // .fetch() on operation level (path = [apiName, operationName])
      if (prop === "fetch" && path.length === 2) {
        return (input?: Record<string, unknown>, opts?: MagiaFetchOptions) =>
          dispatch(config, path[0], path[1], manifest, input, opts);
      }

      // .isError() on operation level — type guard for MagiaError with specific status
      if (prop === "isError" && path.length === 2) {
        return (error: unknown, code: number | string): error is MagiaError =>
          error instanceof MagiaError &&
          error.api === path[0] &&
          error.operation === path[1] &&
          (typeof code === "number" ? error.status === code : error.code === code);
      }

      // .pathKey() on API level (path = [apiName])
      if (prop === "pathKey" && path.length === 1) {
        return () => ["magia", path[0]] as const;
      }

      // Plugin: tanstackQuery — check manifest for plugin activation
      if (path.length >= 1) {
        const apiName = path[0];
        const apiManifest = manifest[apiName];
        if (apiManifest?.plugins.some((p) => p.name === "tanstackQuery")) {
          const result = resolveTanStackQueryProp(path, prop, config, manifest);
          if (result !== undefined) return result;
        }
      }

      // Recurse deeper
      return createProxy(config, manifest, [...path, prop]);
    },

    apply() {
      throw new Error(`Cannot call magia.${path.join(".")} directly — use .fetch()`);
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createMagia(config: MagiaConfig, manifest: Manifest): MagiaClient {
  return createProxy(config, manifest, []) as MagiaClient;
}

// Re-export for internal use by plugins
export { buildUrl, extractBody, extractHeaders, resolveHeaders, dispatch };

// Need the type in scope for the return type
import type { MagiaClient } from "./types";
