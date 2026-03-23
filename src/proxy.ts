import { ofetch, FetchError } from "ofetch";
import type { $Fetch } from "ofetch";
import type {
  Manifest,
  ManifestApi,
  RestManifestEntry,
  GraphQLManifestEntry,
  LazyManifest,
  MagiaConfig,
  MagiaApiConfig,
  MagiaFetchOptions,
  MagiaSubscribeOptions,
  MagiaRequestContext,
  MagiaClient,
} from "./types";
import { MagiaError } from "./error";
import { resolveTanStackQueryProp } from "./plugins/tanstack-query";
import { GraphQLWSClient, type GraphQLWSClientConfig } from "./ws-graphql";
import { dispatchRestWS } from "./ws-rest";

// ---------------------------------------------------------------------------
// Per-API ofetch instances (transport only — retry/timeout)
// ---------------------------------------------------------------------------

const apiClients = new WeakMap<MagiaConfig, Map<string, $Fetch>>();

function getApiClient(config: MagiaConfig, apiConfig: MagiaApiConfig, apiName: string): $Fetch {
  let cache = apiClients.get(config);
  if (!cache) {
    cache = new Map();
    apiClients.set(config, cache);
  }

  let client = cache.get(apiName);
  if (!client) {
    client = ofetch.create({
      retry: apiConfig.retry ?? 0,
      timeout: apiConfig.timeout,
    });
    cache.set(apiName, client);
  }

  return client;
}

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
// Resolve headers (static or async function) — sync fast path
// ---------------------------------------------------------------------------

function resolveHeaders(
  config: MagiaApiConfig,
): Record<string, string> | Promise<Record<string, string>> {
  const h = config.fetchOptions?.headers;
  if (!h) return {};
  if (typeof h === "function") return h();
  return h;
}

// ---------------------------------------------------------------------------
// Shared error wrapping — FetchError → MagiaError
// ---------------------------------------------------------------------------

interface ErrorContext {
  label: string; // e.g. "GET /pet/{petId}" or "GraphQL GetUser"
  api: string;
  operation: string;
  signal?: AbortSignal; // the user's signal, to distinguish user abort vs timeout
}

function wrapFetchError(err: FetchError, ctx: ErrorContext): MagiaError {
  const isAbort = err.cause instanceof DOMException && err.cause.name === "AbortError";

  let code: string;
  if (isAbort) {
    // User-initiated abort (their signal was aborted) vs ofetch internal timeout
    code = ctx.signal?.aborted ? "ABORTED" : "TIMEOUT";
  } else if (err.response) {
    code = String(err.response.status);
  } else {
    code = "NETWORK_ERROR";
  }

  const message = isAbort
    ? `${ctx.label} was aborted`
    : err.response
      ? `${ctx.label} failed with ${err.response.status}`
      : `${ctx.label} network error: ${err.message}`;

  return new MagiaError(message, {
    status: err.response?.status ?? 0,
    code,
    api: ctx.api,
    operation: ctx.operation,
    data: err.data,
    response: err.response as Response | undefined,
  });
}

// ---------------------------------------------------------------------------
// Apply transformError + onError, then throw
// ---------------------------------------------------------------------------

function throwMagiaError(config: MagiaConfig, error: MagiaError): never {
  const transformed = config.transformError ? config.transformError(error) : error;
  config.onError?.(transformed);
  throw transformed;
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
  const client = getApiClient(config, apiConfig, apiName);
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

  // Merge all headers — mutable via onRequest hook
  const mergedHeaders: Record<string, string> = {
    ...contentHeaders,
    ...configHeaders,
    ...inputHeaders,
    ...opts.headers,
  };

  // Build magia request context for hooks
  const reqCtx: MagiaRequestContext = {
    api: apiName,
    operation: operationName,
    url,
    method: entry.method,
    headers: mergedHeaders,
    body: requestBody,
    context: opts.context ?? {},
  };

  // onRequest hook — user can mutate headers, body, etc.
  if (apiConfig.onRequest) {
    await apiConfig.onRequest(reqCtx);
  }

  try {
    const data = await client.raw(url, {
      method: entry.method,
      headers: reqCtx.headers,
      body: reqCtx.body as BodyInit | undefined,
      signal: opts.signal,
    });

    // onResponse hook
    if (apiConfig.onResponse) {
      await apiConfig.onResponse({
        ...reqCtx,
        status: data.status,
        data: data._data,
        response: data as unknown as Response,
      });
    }

    if (opts.raw) {
      return { data: data._data, headers: data.headers, status: data.status };
    }

    return data._data;
  } catch (err) {
    if (err instanceof FetchError) {
      // onResponseError hook
      if (apiConfig.onResponseError && err.response) {
        await apiConfig.onResponseError({
          ...reqCtx,
          status: err.response.status,
          data: err.data,
          response: err.response as Response,
        });
      }

      throwMagiaError(
        config,
        wrapFetchError(err, {
          label: `${entry.method} ${entry.path}`,
          api: apiName,
          operation: operationName,
          signal: opts.signal,
        }),
      );
    }
    throw err;
  }
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
  const client = getApiClient(config, apiConfig, apiName);
  const url = apiConfig.baseUrl;
  const configHeaders = await resolveHeaders(apiConfig);

  const gqlBody = {
    query: entry.document,
    variables: Object.keys(input).length > 0 ? input : undefined,
  };

  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...configHeaders,
    ...opts.headers,
  };

  // Build magia request context for hooks
  const reqCtx: MagiaRequestContext = {
    api: apiName,
    operation: operationName,
    url,
    method: "POST",
    headers: mergedHeaders,
    body: gqlBody,
    context: opts.context ?? {},
  };

  // onRequest hook — user can mutate headers, body, etc.
  if (apiConfig.onRequest) {
    await apiConfig.onRequest(reqCtx);
  }

  let response;
  try {
    response = await client.raw(url, {
      method: "POST",
      headers: reqCtx.headers,
      body: reqCtx.body,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof FetchError) {
      // onResponseError hook
      if (apiConfig.onResponseError && err.response) {
        await apiConfig.onResponseError({
          ...reqCtx,
          status: err.response.status,
          data: err.data,
          response: err.response as Response,
        });
      }

      throwMagiaError(
        config,
        wrapFetchError(err, {
          label: `GraphQL ${operationName}`,
          api: apiName,
          operation: operationName,
          signal: opts.signal,
        }),
      );
    }
    throw err;
  }

  const json = response._data as { data?: unknown; errors?: unknown[] };

  // onResponse hook
  if (apiConfig.onResponse) {
    await apiConfig.onResponse({
      ...reqCtx,
      status: response.status,
      data: json?.data,
      response: response as unknown as Response,
    });
  }

  // GraphQL errors in response body
  if (json?.errors && Array.isArray(json.errors) && json.errors.length > 0) {
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
        response: response as unknown as Response,
      },
    );
    throwMagiaError(config, error);
  }

  if (opts.raw) {
    return { data: json?.data, headers: response.headers, status: response.status };
  }

  return json?.data;
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
// SSE error wrapping (native fetch errors, not FetchError)
// ---------------------------------------------------------------------------

function wrapSSEFetchError(fetchErr: unknown, ctx: ErrorContext): MagiaError {
  const isAbort = fetchErr instanceof DOMException && fetchErr.name === "AbortError";
  let code: string;
  if (isAbort) {
    code = ctx.signal?.aborted ? "ABORTED" : "TIMEOUT";
  } else {
    code = "NETWORK_ERROR";
  }

  return new MagiaError(
    isAbort
      ? `${ctx.label} was aborted`
      : `${ctx.label} network error: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
    {
      status: 0,
      code,
      api: ctx.api,
      operation: ctx.operation,
      data: undefined,
    },
  );
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

    // SSE needs raw fetch for streaming — ofetch doesn't support ReadableStream
    let response: Response;
    try {
      response = await globalThis.fetch(url, {
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
      throw wrapSSEFetchError(fetchErr, {
        label: `SSE ${entry.path}`,
        api: apiName,
        operation: operationName,
        signal: opts.signal,
      });
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

    // GraphQL SSE needs raw fetch for streaming
    let response: Response;
    try {
      response = await globalThis.fetch(url, {
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
      throw wrapSSEFetchError(fetchErr, {
        label: `GraphQL subscription ${operationName}`,
        api: apiName,
        operation: operationName,
        signal: opts.signal,
      });
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
// GraphQL WS client cache — one per API (like ofetch instances)
// ---------------------------------------------------------------------------

const wsClients = new WeakMap<MagiaConfig, Map<string, GraphQLWSClient>>();

function getGraphQLWSClient(
  config: MagiaConfig,
  apiName: string,
  apiConfig: MagiaApiConfig,
): GraphQLWSClient {
  let cache = wsClients.get(config);
  if (!cache) {
    cache = new Map();
    wsClients.set(config, cache);
  }

  let client = cache.get(apiName);
  if (!client) {
    const wsConfig: GraphQLWSClientConfig = {
      wsUrl: apiConfig.wsUrl!,
      ...apiConfig.ws,
      onSubscriptionEvent: apiConfig.onSubscriptionEvent,
      onSubscriptionError: apiConfig.onSubscriptionError,
    };
    client = new GraphQLWSClient(wsConfig, apiName);
    cache.set(apiName, client);
  }
  return client;
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

    const forceTransport = opts.transport;

    // GraphQL subscription
    if (entry.type === "graphql" && entry.kind === "subscription") {
      const useWS = forceTransport === "ws" || (forceTransport !== "sse" && !!apiConfig.wsUrl);

      if (useWS) {
        const client = getGraphQLWSClient(config, apiName, apiConfig);
        yield* client.subscribe(operationName, entry.document, input, opts.signal);
        return;
      }
      // Fall back to existing SSE
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

    // REST WS
    if (entry.type === "rest" && entry.ws && apiConfig.wsUrl && forceTransport !== "sse") {
      yield* dispatchRestWS(config, apiName, operationName, entry, apiConfig, input, opts);
      return;
    }

    // REST SSE (existing)
    if (entry.type === "rest" && entry.sse) {
      yield* dispatchRestSSE(config, apiName, operationName, entry, apiConfig, input, opts);
      return;
    }

    throw new Error(
      `${apiName}.${operationName} does not support .subscribe(). ` +
        `Only SSE endpoints, WS endpoints, and GraphQL subscriptions support subscriptions.`,
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
// Safe dispatch — returns { data, error } instead of throwing
// ---------------------------------------------------------------------------

async function safeFetchDispatch(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  input: Record<string, unknown> = {},
  opts: MagiaFetchOptions = {},
): Promise<{ data: unknown; error: undefined } | { data: undefined; error: MagiaError }> {
  try {
    const data = await dispatch(config, apiName, operationName, input, opts);
    return { data, error: undefined };
  } catch (err) {
    if (err instanceof MagiaError) {
      return { data: undefined, error: err };
    }
    // Unexpected errors still get wrapped
    const wrapped = new MagiaError(err instanceof Error ? err.message : String(err), {
      status: 0,
      code: "UNKNOWN",
      api: apiName,
      operation: operationName,
      data: undefined,
    });
    return { data: undefined, error: wrapped };
  }
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

      // .safeFetch() on operation level — returns { data, error } instead of throwing
      if (prop === "safeFetch" && path.length === 2) {
        return (input?: Record<string, unknown>, opts?: MagiaFetchOptions) =>
          safeFetchDispatch(config, path[0], path[1], input, opts);
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

// Re-export for internal use by plugins and ws-rest
export { buildUrl, extractBody, extractHeaders, resolveHeaders, dispatch, dispatchSubscribe };
