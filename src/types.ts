// ---------------------------------------------------------------------------
// Manifest (internal — describes operations for the Proxy)
// ---------------------------------------------------------------------------

export type ParamLocation = "path" | "query" | "body" | "header";

export interface ManifestEntry {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string; // e.g. "/pet/{petId}"
  params: Record<string, ParamLocation>;
}

export interface MagiaPlugin {
  name: string;
}

export interface ManifestApi {
  plugins: MagiaPlugin[]; // e.g. [tanstackQuery()] — set at compile time by defineConfig
  operations: Record<string, ManifestEntry>;
}

export type Manifest = Record<string, ManifestApi>;
//                           ^ api name

// ---------------------------------------------------------------------------
// Fetch options & response
// ---------------------------------------------------------------------------

export interface MagiaFetchOptions {
  signal?: AbortSignal;
  raw?: boolean;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export interface MagiaRawResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

// ---------------------------------------------------------------------------
// Operation types (used in .d.ts augmentation)
// ---------------------------------------------------------------------------

export interface MagiaOperation<TInput, TOutput, TErrors = {}> {
  fetch(input: TInput, opts?: MagiaFetchOptions): Promise<TOutput>;
  fetch(input: TInput, opts: MagiaFetchOptions & { raw: true }): Promise<MagiaRawResponse<TOutput>>;
}

export interface MagiaMutation<TInput, TOutput, TErrors = {}> {
  fetch(input: TInput, opts?: MagiaFetchOptions): Promise<TOutput>;
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

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MagiaClient {}

// ---------------------------------------------------------------------------
// createMagia config
// ---------------------------------------------------------------------------

export interface MagiaApiConfig {
  baseUrl: string;
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

export interface MagiaConfig {
  apis: Record<string, MagiaApiConfig>;
  plugins?: MagiaPluginOptions;
  onError?: (error: Error) => void;
}
