// ---------------------------------------------------------------------------
// Manifest (internal — describes operations for the Proxy)
// ---------------------------------------------------------------------------

export type ParamLocation = "path" | "query" | "body" | "header";

export type PaginationStyle = "offset" | "cursor" | "page";

export interface PaginationMeta {
  style: PaginationStyle;
  /** The param that changes per page (e.g. "offset", "cursor", "page") */
  pageParam: string;
  /** The size param (e.g. "limit", "pageSize") */
  sizeParam?: string;
}

export interface RestManifestEntry {
  type: "rest";
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string; // e.g. "/pet/{petId}"
  params: Record<string, ParamLocation>;
  /** true when requestBody has multipart/form-data content type */
  multipart?: boolean;
  /** true when response is text/event-stream (SSE) */
  sse?: boolean;
  /** true when operation supports WebSocket (detected via x-websocket extension) */
  ws?: boolean;
  /** Pagination metadata for infinite query support */
  pagination?: PaginationMeta;
}

export interface GraphQLManifestEntry {
  type: "graphql";
  kind: "query" | "mutation" | "subscription";
  document: string; // compiled GraphQL document string
  /** Pagination metadata for infinite query support (Relay-style) */
  pagination?: PaginationMeta;
}

export type ManifestEntry = RestManifestEntry | GraphQLManifestEntry;

export interface MagiaPlugin {
  name: string;
}

export interface ManifestApi {
  plugins: MagiaPlugin[]; // e.g. [tanstackQuery()] — set at compile time by defineConfig
  operations: Record<string, ManifestEntry>;
}

export type Manifest = Record<string, ManifestApi>;
//                           ^ api name

/** Lazy manifest — values can be async functions that return ManifestApi (for code splitting) */
export type LazyManifestApi = ManifestApi | (() => Promise<ManifestApi>);
export type LazyManifest = Record<string, LazyManifestApi>;

// ---------------------------------------------------------------------------
// Fetch options & response
// ---------------------------------------------------------------------------

/** Augmentable context — users extend via `declare module "magia-api"` */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MagiaContext {
  [key: string]: unknown;
}

export interface MagiaFetchOptions {
  signal?: AbortSignal;
  raw?: boolean;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** Custom per-request context passed to interceptors (onRequest, onResponse, onResponseError) */
  context?: MagiaContext;
}

// ---------------------------------------------------------------------------
// Interceptor types (magia-owned — no ofetch types exposed)
// ---------------------------------------------------------------------------

export interface MagiaRequestContext {
  /** API name from manifest */
  readonly api: string;
  /** Operation name from manifest */
  readonly operation: string;
  /** Full URL being requested */
  readonly url: string;
  /** HTTP method */
  readonly method: string;
  /** Request headers — mutable, modify to inject auth, tracing, etc. */
  headers: Record<string, string>;
  /** Request body — mutable */
  body: unknown;
  /** Custom per-request context from .fetch() options */
  readonly context: MagiaContext;
}

export interface MagiaResponseContext extends MagiaRequestContext {
  /** HTTP status code */
  readonly status: number;
  /** Parsed response data */
  readonly data: unknown;
  /** Raw Response object */
  readonly response: Response;
}

export interface MagiaSubscribeOptions {
  signal?: AbortSignal;
  reconnect?: boolean;
  /** SSE only — resume from last event ID */
  lastEventId?: string;
  /** Per-call transport override (rare escape hatch) */
  transport?: "sse" | "ws";
}

export interface MagiaSubscription<TInput, TEvent> {
  subscribe(input: TInput, opts?: MagiaSubscribeOptions): AsyncIterable<TEvent>;
}

/** @deprecated Use MagiaSubscription */
export type MagiaSSEOperation<TInput, TEvent> = MagiaSubscription<TInput, TEvent>;

export interface MagiaRawResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

// ---------------------------------------------------------------------------
// Type helpers for generated code (openapi-typescript → magia types)
// ---------------------------------------------------------------------------

/** Flatten openapi-typescript operation params (path, query, header, body) into a single input type */
export type FlatInput<T> = T extends {
  parameters?: { path?: infer P; query?: infer Q; header?: infer H };
  requestBody?: { content: { [k: string]: infer B } };
}
  ? (P extends object ? P : {}) &
      (Q extends object ? Q : {}) &
      (H extends object ? H : {}) &
      (B extends object ? B : {})
  : T extends {
        parameters?: { path?: infer P; query?: infer Q; header?: infer H };
      }
    ? (P extends object ? P : {}) & (Q extends object ? Q : {}) & (H extends object ? H : {})
    : {};

/** Extract success response type (first 2XX response with application/json) */
export type SuccessResponse<T> = T extends { 200: { content: { "application/json": infer R } } }
  ? R
  : T extends { 201: { content: { "application/json": infer R } } }
    ? R
    : T extends { 204: { content: { "application/json": infer R } } }
      ? R
      : void;

/** Extract error response types as { status: ErrorType } map */
export type ErrorResponses<T> = {
  [K in keyof T as K extends `4${string}` | `5${string}` ? K : never]: T[K] extends {
    content: { "application/json": infer E };
  }
    ? E
    : unknown;
};

// ---------------------------------------------------------------------------
// Operation types (used in .d.ts augmentation)
// ---------------------------------------------------------------------------

import type { MagiaError } from "./error";

export type MagiaSafeResult<T> =
  | { data: T; error: undefined }
  | { data: undefined; error: MagiaError };

export interface MagiaOperation<TInput, TOutput, TErrors = {}> {
  fetch(input: TInput, opts?: MagiaFetchOptions): Promise<TOutput>;
  fetch(input: TInput, opts: MagiaFetchOptions & { raw: true }): Promise<MagiaRawResponse<TOutput>>;
  safeFetch(input: TInput, opts?: MagiaFetchOptions): Promise<MagiaSafeResult<TOutput>>;
  isError<TCode extends keyof TErrors>(
    error: unknown,
    code: TCode,
  ): error is MagiaError & { status: TCode; data: TErrors[TCode] };
}

export interface MagiaMutation<TInput, TOutput, TErrors = {}> {
  fetch(input: TInput, opts?: MagiaFetchOptions): Promise<TOutput>;
  safeFetch(input: TInput, opts?: MagiaFetchOptions): Promise<MagiaSafeResult<TOutput>>;
  isError<TCode extends keyof TErrors>(
    error: unknown,
    code: TCode,
  ): error is MagiaError & { status: TCode; data: TErrors[TCode] };
}

// ---------------------------------------------------------------------------
// TanStack Query plugin types (used in .d.ts augmentation)
// ---------------------------------------------------------------------------

export interface MagiaTanStackQuery<TInput, TOutput> {
  queryOptions(
    input: TInput,
    opts?: { signal?: AbortSignal },
  ): {
    queryKey: readonly ["magia", string, string, TInput?];
    queryFn: (ctx: { signal: AbortSignal }) => Promise<TOutput>;
  };
  queryKey(input?: TInput): readonly ["magia", string, string, TInput?];
}

export interface MagiaTanStackMutation<TInput, TOutput> {
  mutationOptions(opts?: {
    onSuccess?: (data: TOutput, variables: TInput) => void;
    onError?: (error: Error, variables: TInput) => void;
  }): {
    mutationFn: (input: TInput) => Promise<TOutput>;
    mutationKey: readonly ["magia", string, string];
  };
  mutationKey(): readonly ["magia", string, string];
}

export interface MagiaTanStackInfiniteQuery<TInput, TOutput> {
  infiniteQueryOptions(
    input: TInput,
    opts?: { getNextPageParam?: (lastPage: TOutput) => unknown },
  ): {
    queryKey: readonly ["magia", string, string, TInput?];
    queryFn: (ctx: { signal: AbortSignal; pageParam: unknown }) => Promise<TOutput>;
    getNextPageParam?: (lastPage: TOutput) => unknown;
  };
}

export interface MagiaTanStackSubscription<TInput, TEvent> {
  subscriptionOptions(
    input: TInput,
    opts?: { signal?: AbortSignal },
  ): {
    queryKey: readonly ["magia", string, string, TInput?];
    queryFn: (ctx: { signal: AbortSignal }) => AsyncIterable<TEvent>;
  };
  subscriptionKey(input?: TInput): readonly ["magia", string, string, TInput?];
}

// ---------------------------------------------------------------------------
// defineConfig types (compile-time — magia-api.config.ts)
// ---------------------------------------------------------------------------

export interface SchemaScript {
  command: string;
  output: string;
}

export type SchemaSource =
  | string // URL or local file path
  | (() => Promise<string>) // async function returning schema text
  | SchemaScript; // shell command + output file

interface BaseApiDefConfig {
  schema: SchemaSource;
  plugins?: MagiaPlugin[];
  schemaWatch?: boolean;
  schemaCache?: "disabled" | { ttl: string };
  operationName?: (method: string, path: string, operationId?: string) => string;
}

export interface RestApiDefConfig extends BaseApiDefConfig {
  type: "rest";
}

export interface GraphQLApiDefConfig extends BaseApiDefConfig {
  type: "graphql";
  documents: string | string[];
}

export type ApiDefConfig = RestApiDefConfig | GraphQLApiDefConfig;

export interface DefineConfigInput {
  apis: Record<string, ApiDefConfig>;
  /** Path for generated magia.gen.ts */
  output: string;
}

// ---------------------------------------------------------------------------
// Client interface (empty — augmented by generated .d.ts)
// ---------------------------------------------------------------------------

export interface MagiaClient {
  /** Destructure API proxies for cleaner imports */
  shorthands(): { [K in keyof this]: this[K] };
}

// ---------------------------------------------------------------------------
// createMagia config
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// WebSocket config types
// ---------------------------------------------------------------------------

export interface MagiaWSConfig {
  /** Milliseconds before closing idle GraphQL WS connection (default: 3000) */
  closeTimeout?: number;
  /** Max reconnection attempts on unexpected disconnect (default: 5) */
  retryAttempts?: number;
  /** Custom WebSocket constructor (for older Node.js without native WebSocket) */
  webSocketImpl?: unknown;
}

export interface MagiaGraphQLWSConfig extends MagiaWSConfig {
  /** Auth payload sent in ConnectionInit (graphql-transport-ws protocol). GraphQL only. */
  connectionParams?:
    | Record<string, unknown>
    | (() => Record<string, unknown>)
    | (() => Promise<Record<string, unknown>>);
}

// ---------------------------------------------------------------------------
// createMagia per-API config
// ---------------------------------------------------------------------------

export interface MagiaApiConfig {
  baseUrl: string;
  /** WebSocket base URL — enables WS transport for subscriptions */
  wsUrl?: string;
  /** WebSocket configuration (narrowed to MagiaGraphQLWSConfig for GraphQL APIs via module augmentation) */
  ws?: MagiaWSConfig;
  /** Number of retry attempts for failed requests (default: 0, false to disable) */
  retry?: number | false;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Called before each HTTP request — mutate ctx.headers to inject auth, tracing, etc. */
  onRequest?: (ctx: MagiaRequestContext) => void | Promise<void>;
  /** Called after each successful HTTP response — use for data transforms, logging */
  onResponse?: (ctx: MagiaResponseContext) => void | Promise<void>;
  /** Called on HTTP error responses (4xx/5xx) — fires before MagiaError wrapping */
  onResponseError?: (ctx: MagiaResponseContext) => void | Promise<void>;
  /** Called on each incoming subscription event (WS or SSE) before yielding to consumer */
  onSubscriptionEvent?: (event: unknown) => void;
  /** Called on subscription connection errors (WS close, SSE fetch error) */
  onSubscriptionError?: (error: MagiaError) => void;
  fetchOptions?: {
    headers?:
      | Record<string, string>
      | (() => Record<string, string>)
      | (() => Promise<Record<string, string>>);
  };
}

// ---------------------------------------------------------------------------
// Plugin options (runtime — passed to createMagia)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TanStackQueryPluginOptions {
  // Future: global runtime options for TanStack Query plugin
}

export interface MagiaPluginOptions {
  tanstackQuery?: TanStackQueryPluginOptions;
}

// ---------------------------------------------------------------------------
// createMagia config
// ---------------------------------------------------------------------------

export interface MagiaConfig<TManifest extends Manifest | LazyManifest = Manifest> {
  /** Generated manifest from magia.gen.ts */
  manifest: TManifest;
  /** Per-API runtime config — keys must match manifest API names */
  apis: { [K in keyof TManifest]: MagiaApiConfig };
  plugins?: MagiaPluginOptions;
  onError?: (error: MagiaError) => void;
  /** Transform errors before they're thrown. Return value replaces the original error. */
  transformError?: (error: MagiaError) => MagiaError;
}
