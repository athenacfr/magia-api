import type { FetchOptions } from "ofetch";

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

export interface MagiaFetchOptions {
  signal?: AbortSignal;
  raw?: boolean;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface MagiaSubscribeOptions {
  signal?: AbortSignal;
  reconnect?: boolean;
  lastEventId?: string;
}

export interface MagiaSSEOperation<TInput, TEvent> {
  subscribe(input: TInput, opts?: MagiaSubscribeOptions): AsyncIterable<TEvent>;
}

export interface MagiaRawResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

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

export interface MagiaApiConfig {
  baseUrl: string;
  /** Number of retry attempts for failed requests (default: 0, false to disable) */
  retry?: FetchOptions["retry"];
  /** Request timeout in milliseconds */
  timeout?: FetchOptions["timeout"];
  /** Called before each request — use for auth injection, logging, etc. */
  onRequest?: FetchOptions["onRequest"];
  /** Called after each successful response — use for data transforms, logging */
  onResponse?: FetchOptions["onResponse"];
  /** Called on error responses (4xx/5xx) — fires before MagiaError wrapping */
  onResponseError?: FetchOptions["onResponseError"];
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
