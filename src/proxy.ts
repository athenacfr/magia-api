import type {
  Manifest,
  ManifestApi,
  ManifestEntry,
  RestManifestEntry,
  GraphQLManifestEntry,
  LazyManifest,
  MagiaConfig,
  MagiaApiConfig,
  MagiaFetchOptions,
  MagiaSubscribeOptions,
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

async function resolveHeaders(config: MagiaApiConfig): Promise<Record<string, string>> {
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
  apiConfig: MagiaApiConfig,
  input: Record<string, unknown>,
  opts: MagiaFetchOptions,
): Promise<unknown> {
  const url = buildUrl(apiConfig.baseUrl, entry, input, opts.query);
  const body = extractBody(entry, input);
  const configHeaders = await resolveHeaders(apiConfig);
  const inputHeaders = extractHeaders(entry, input);

  // Build request body — FormData for multipart, JSON otherwise
  let requestBody: BodyInit | undefined;
  const contentHeaders: Record<string, string> = {};
  if (body != null && entry.multipart) {
    const formData = new FormData();
    for (const [key, val] of Object.entries(body as Record<string, unknown>)) {
      if (val instanceof Blob) {
        formData.append(key, val, val instanceof File ? val.name : key);
      } else if (val != null) {
        formData.append(key, String(val));
      }
    }
    requestBody = formData;
    // Don't set Content-Type — browser/runtime sets it with boundary
  } else if (body != null) {
    requestBody = JSON.stringify(body);
    contentHeaders["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: entry.method,
      headers: {
        ...contentHeaders,
        ...configHeaders,
        ...inputHeaders,
        ...opts.headers,
      },
      body: requestBody,
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
  apiConfig: MagiaApiConfig,
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
// SSE parsing helper
// ---------------------------------------------------------------------------

async function* parseSSEStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentData = "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          currentData += (currentData ? "\n" : "") + line.slice(6);
        } else if (line === "" && currentData) {
          // End of event — empty line delimiter
          try {
            yield JSON.parse(currentData);
          } catch {
            yield currentData;
          }
          currentData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// REST SSE dispatch
// ---------------------------------------------------------------------------

function dispatchRestSSE(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  entry: RestManifestEntry,
  apiConfig: MagiaApiConfig,
  input: Record<string, unknown>,
  opts: MagiaSubscribeOptions,
): AsyncIterable<unknown> {
  async function* generate(): AsyncIterable<unknown> {
    const url = buildUrl(apiConfig.baseUrl, entry, input);
    const configHeaders = await resolveHeaders(apiConfig);
    const inputHeaders = extractHeaders(entry, input);

    let response: Response;
    try {
      response = await fetch(url, {
        method: entry.method,
        headers: {
          Accept: "text/event-stream",
          ...configHeaders,
          ...inputHeaders,
          ...(opts.lastEventId ? { "Last-Event-ID": opts.lastEventId } : {}),
        },
        body: entry.method !== "GET" ? JSON.stringify(extractBody(entry, input)) : undefined,
        signal: opts.signal,
      });
    } catch (fetchErr) {
      const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
      throw new MagiaError(
        isAbort
          ? `SSE ${entry.path} was aborted`
          : `SSE ${entry.path} network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        {
          status: 0,
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          api: apiName,
          operation: operationName,
          data: undefined,
        },
      );
    }

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = undefined;
      }
      throw new MagiaError(`SSE ${entry.path} failed with ${response.status}`, {
        status: response.status,
        code: String(response.status),
        api: apiName,
        operation: operationName,
        data: errorData,
        response,
      });
    }

    if (!response.body) {
      throw new MagiaError(`SSE ${entry.path} returned no body`, {
        status: response.status,
        code: "NO_BODY",
        api: apiName,
        operation: operationName,
        data: undefined,
        response,
      });
    }

    yield* parseSSEStream(response.body, opts.signal);
  }

  return generate();
}

// ---------------------------------------------------------------------------
// GraphQL subscription dispatch (SSE-based)
// ---------------------------------------------------------------------------

function dispatchGraphQLSubscription(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  entry: GraphQLManifestEntry,
  apiConfig: MagiaApiConfig,
  input: Record<string, unknown>,
  opts: MagiaSubscribeOptions,
): AsyncIterable<unknown> {
  async function* generate(): AsyncIterable<unknown> {
    const url = apiConfig.baseUrl;
    const configHeaders = await resolveHeaders(apiConfig);

    // Use the GraphQL-over-SSE protocol (graphql-sse)
    const body = JSON.stringify({
      query: entry.document,
      variables: Object.keys(input).length > 0 ? input : undefined,
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...configHeaders,
        },
        body,
        signal: opts.signal,
      });
    } catch (fetchErr) {
      const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
      throw new MagiaError(
        isAbort
          ? `GraphQL subscription ${operationName} was aborted`
          : `GraphQL subscription ${operationName} network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        {
          status: 0,
          code: isAbort ? "TIMEOUT" : "NETWORK_ERROR",
          api: apiName,
          operation: operationName,
          data: undefined,
        },
      );
    }

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = undefined;
      }
      throw new MagiaError(`GraphQL subscription ${operationName} failed with ${response.status}`, {
        status: response.status,
        code: String(response.status),
        api: apiName,
        operation: operationName,
        data: errorData,
        response,
      });
    }

    if (!response.body) {
      throw new MagiaError(`GraphQL subscription ${operationName} returned no body`, {
        status: response.status,
        code: "NO_BODY",
        api: apiName,
        operation: operationName,
        data: undefined,
        response,
      });
    }

    // GraphQL SSE wraps data in { data: ... } envelopes
    for await (const event of parseSSEStream(response.body, opts.signal)) {
      const envelope = event as { data?: unknown; errors?: unknown[] };
      if (envelope.errors?.length) {
        const firstErr = envelope.errors[0] as Record<string, unknown>;
        throw new MagiaError(
          (firstErr.message as string) ?? `GraphQL subscription ${operationName} error`,
          {
            status: 200,
            code: "GRAPHQL_ERROR",
            api: apiName,
            operation: operationName,
            data: envelope.errors,
          },
        );
      }
      if (envelope.data !== undefined) {
        yield envelope.data;
      } else {
        yield event;
      }
    }
  }

  return generate();
}

// ---------------------------------------------------------------------------
// Subscribe dispatch
// ---------------------------------------------------------------------------

function dispatchSubscribe(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  input: Record<string, unknown> = {},
  opts: MagiaSubscribeOptions = {},
): AsyncIterable<unknown> {
  async function* generate(): AsyncIterable<unknown> {
    const apiManifest = await resolveManifest(config, apiName);

    const entry = apiManifest.operations[operationName];
    if (!entry) throw new Error(`Unknown operation: ${apiName}.${operationName}`);

    const apiConfig = config.apis[apiName];
    if (!apiConfig) throw new Error(`No config for API: ${apiName}`);

    if (entry.type === "graphql" && entry.kind === "subscription") {
      yield* dispatchGraphQLSubscription(
        config,
        apiName,
        operationName,
        entry,
        apiConfig,
        input,
        opts,
      );
      return;
    }

    if (entry.type === "rest" && entry.sse) {
      yield* dispatchRestSSE(config, apiName, operationName, entry, apiConfig, input, opts);
      return;
    }

    throw new Error(
      `${apiName}.${operationName} does not support .subscribe(). ` +
        `Only SSE endpoints (text/event-stream) and GraphQL subscriptions support subscriptions.`,
    );
  }

  return generate();
}

// ---------------------------------------------------------------------------
// Lazy manifest resolution
// ---------------------------------------------------------------------------

const resolvedManifests = new WeakMap<
  MagiaConfig,
  Map<string, ManifestApi | Promise<ManifestApi>>
>();

async function resolveManifest(config: MagiaConfig, apiName: string): Promise<ManifestApi> {
  let cache = resolvedManifests.get(config);
  if (!cache) {
    cache = new Map();
    resolvedManifests.set(config, cache);
  }

  const cached = cache.get(apiName);
  if (cached) {
    return cached instanceof Promise ? cached : cached;
  }

  const entry = (config.manifest as LazyManifest)[apiName];
  if (!entry) throw new Error(`Unknown API: ${apiName}`);

  if (typeof entry === "function") {
    const promise = entry();
    cache.set(apiName, promise);
    const resolved = await promise;
    cache.set(apiName, resolved);
    return resolved;
  }

  cache.set(apiName, entry);
  return entry;
}

/**
 * Synchronous manifest lookup — returns undefined if not yet resolved.
 * Used by the proxy's get trap (which is sync) for plugin detection.
 */
function getResolvedManifest(config: MagiaConfig, apiName: string): ManifestApi | undefined {
  const cache = resolvedManifests.get(config);
  if (!cache) return undefined;
  const entry = cache.get(apiName);
  if (!entry || entry instanceof Promise) return undefined;
  return entry;
}

// ---------------------------------------------------------------------------
// Unified dispatch
// ---------------------------------------------------------------------------

async function dispatch(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  input: Record<string, unknown> = {},
  opts: MagiaFetchOptions = {},
): Promise<unknown> {
  const apiManifest = await resolveManifest(config, apiName);

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

function createProxy(config: MagiaConfig, path: string[]): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string) {
      if (prop === "then") return undefined; // not a thenable

      // .shorthands() on root level — destructure API proxies
      if (prop === "shorthands" && path.length === 0) {
        return () => {
          const result: Record<string, unknown> = {};
          for (const apiName of Object.keys(config.manifest)) {
            result[apiName] = createProxy(config, [apiName]);
          }
          return result;
        };
      }

      // .fetch() on operation level (path = [apiName, operationName])
      if (prop === "fetch" && path.length === 2) {
        return (input?: Record<string, unknown>, opts?: MagiaFetchOptions) =>
          dispatch(config, path[0], path[1], input, opts);
      }

      // .subscribe() on operation level (SSE / GraphQL subscriptions)
      if (prop === "subscribe" && path.length === 2) {
        return (input?: Record<string, unknown>, opts?: MagiaSubscribeOptions) =>
          dispatchSubscribe(config, path[0], path[1], input, opts);
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

      // Eagerly trigger lazy manifest resolution when an API namespace is first accessed
      if (path.length === 0) {
        const entry = (config.manifest as LazyManifest)[prop];
        if (entry && typeof entry === "function") {
          // Kick off resolution so it's ready by the time .fetch()/.queryOptions() is called
          resolveManifest(config, prop);
        }
      }

      // Plugin: tanstackQuery — check manifest for plugin activation
      if (path.length >= 1) {
        const apiName = path[0];
        // Try synchronous cache first, fall back to direct manifest lookup
        const apiManifest =
          getResolvedManifest(config, apiName) ??
          ((config.manifest as Record<string, ManifestApi>)[apiName] as ManifestApi | undefined);
        if (apiManifest?.plugins?.some((p) => p.name === "tanstackQuery")) {
          const result = resolveTanStackQueryProp(path, prop, config);
          if (result !== undefined) return result;
        }
      }

      // Recurse deeper
      return createProxy(config, [...path, prop]);
    },

    apply() {
      throw new Error(`Cannot call magia.${path.join(".")} directly — use .fetch()`);
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createMagia<TManifest extends Manifest | LazyManifest>(
  config: MagiaConfig<TManifest>,
): MagiaClient {
  return createProxy(config as MagiaConfig, []) as MagiaClient;
}

// Re-export for internal use by plugins
export { buildUrl, extractBody, extractHeaders, resolveHeaders, dispatch };

// Need the type in scope for the return type
import type { MagiaClient } from "./types";
