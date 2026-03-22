# State

## Decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D-001 | Use Hey API + graphql-codegen as internal SDKs | Battle-tested, never exposed to users. | 2026-03-22 |
| D-002 | Vite plugin as primary DX. Vite only first. | "No codegen step" experience. Non-Vite support deferred. | 2026-03-22 |
| D-003 | Opinionated by design — no user config of codegen internals | Users configure: type, schema, documents, magia plugins. | 2026-03-22 |
| D-004 | Schema input: URLs, files, async functions, scripts. No built-in cloud. | Keep core lean. | 2026-03-22 |
| D-005 | Hey API as internal REST SDK | 6M downloads/mo, built-in data transformers + SSE. | 2026-03-22 |
| D-006 | Zero visible files: `src/magia-api.d.ts` (gitignored) + `node_modules/.magia/` (hidden) | Like Vite's `node_modules/.vite/` cache. No tsconfig changes. | 2026-03-22 |
| D-007 | Import from `magia-api` package, not generated paths | `declare module 'magia-api'` augmentation. | 2026-03-22 |
| D-008 | Namespace: `magia.<api>.<operation>.fetch()` with plugin extensions | tRPC v11 pattern. | 2026-03-22 |
| D-009 | TanStack Query as a plugin (`tanstackQuery()`) | Plugin architecture: base generates fetch, plugins extend. | 2026-03-22 |
| D-010 | SSE is core (REST), subscriptions are core (GraphQL). Same `.subscribe()` API. | Auto-detected from spec. REST SSE via Hey API. GraphQL via graphql-request SSE transport. | 2026-03-22 |
| D-011 | tRPC v11 option factories (not wrapped hooks) | `useQuery(magia.x.y.queryOptions())`. Standard TanStack Query API. | 2026-03-22 |
| D-012 | Unified DX: REST and GraphQL identical API surface | User never knows which protocol. | 2026-03-22 |
| D-013 | Manifest bundled via Vite virtual module (`virtual:magia-manifest`) | Can't filesystem-read in browser. Vite inlines it. | 2026-03-22 |
| D-014 | Runtime URL config is Vite's job | `createMagia({ apis: { x: { baseUrl: import.meta.env.VITE_X_URL } } })` | 2026-03-22 |
| D-015 | Hierarchical query keys: `["magia", "<api>", "<op>", input?]` | tRPC-style partial matching. | 2026-03-22 |
| D-016 | TanStack Query config is user's job via standard QueryClient | No `queryDefaults` in magia. | 2026-03-22 |
| D-017 | No `<MagiaProvider>` — standard `<QueryClientProvider>` | Option factories need no magia-specific context. | 2026-03-22 |
| D-018 | CLI `magia-api generate` for CI | Generates `node_modules/.magia/` + `src/magia-api.d.ts`. | 2026-03-22 |
| D-019 | Smart schema watch: local + localhost auto-watched, remote cached with TTL | Smart defaults. | 2026-03-22 |
| D-020 | `MAGIA_<API>_SCHEMA` env var overrides schema source | Build-time only. | 2026-03-22 |
| D-021 | Schema cache in `node_modules/.magia/schemas/` | Wiped on install, regenerated. | 2026-03-22 |
| D-022 | Dev: auto-refetch + retry on codegen error. CI: fail immediately. | Stale cache shouldn't block dev. | 2026-03-22 |
| D-023 | Comprehensive docs on GitHub | Good docs are part of the product. | 2026-03-22 |
| D-024 | AbortSignal on all `.fetch()` calls | Standard Web API. | 2026-03-22 |
| D-025 | Data transformers built from OpenAPI `format` fields | Auto-deserialization for REST. GraphQL scalar transforms deferred. | 2026-03-22 |
| D-026 | Type inference: `InferInput<Api, Op>` and `InferOutput<Api, Op>` | Extract types by API + operation name. | 2026-03-22 |
| D-027 | Typed errors from OpenAPI error responses + GraphQL error extensions | `MagiaError` class + `.isError()` type guards. | 2026-03-22 |
| D-028 | Separate config file (`magia-api.config.ts`) auto-discovered | CLI needs it independently of Vite. | 2026-03-22 |
| D-029 | Lazy imports via Proxy (future) | Dynamic import on first call. | 2026-03-22 |
| D-030 | `{ raw: true }` option for response headers access | Returns `{ data, headers, status }`. | 2026-03-22 |
| D-031 | Single npm package `magia-api` with multiple entry points | `magia-api`, `magia-api/vite`, `magia-api/cli`, `magia-api/test`. Not a monorepo. | 2026-03-22 |
| D-032 | `@hey-api/client-fetch` as REST runtime client | Battle-tested, handles interceptors, auth, edge cases. Internal dependency. | 2026-03-22 |
| D-033 | `graphql-request` as GraphQL runtime client | Lightweight, supports SSE subscriptions, TypedDocumentNode. Internal dependency. | 2026-03-22 |
| D-034 | Flat parameter mapping, auto-detected from manifest | path > query > body priority. Explicit `{ query, headers }` override in options for edge cases. | 2026-03-22 |
| D-035 | File uploads auto-detected from OpenAPI `multipart/form-data` | Accept `File`/`Blob` in input, magia constructs FormData internally. | 2026-03-22 |
| D-036 | `tanstackQuery()` plugin includes `infiniteQueryOptions` for paginated endpoints | Auto-detect pagination from spec (offset/limit, cursor/after, page/pageSize, Relay first/after). | 2026-03-22 |
| D-037 | Build magia-api package with tsup | Battle-tested for library builds with multiple entry points. | 2026-03-22 |
| D-038 | Testing utilities in `magia-api/test`: `createTestMagia`, `mockOperation`, `createFakerMagia` | Tier 1: full mock client. Tier 2: per-operation mock/spy. Tier 3: faker mocks auto-generated from schema types. Tier 4 (future): MSW integration. `@faker-js/faker` is a peer dependency of `magia-api/test` only — never bundled in production. | 2026-03-22 |
| D-039 | GraphQL subscriptions via SSE transport only (graphql-sse protocol). WebSocket (graphql-ws) deferred. | `graphql-request` supports SSE subscriptions. WebSocket requires a different transport and server support — out of scope for v1. Document this limitation. | 2026-03-22 |
| D-040 | `createMagia()` auto-imports manifest from `virtual:magia-manifest` internally. Users never reference the manifest. | The Vite plugin resolves the virtual module. For CLI/testing, manifest is loaded from `node_modules/.magia/manifest.ts` directly. | 2026-03-22 |
| D-041 | E2E tests run in Docker containers, one per state (10 states). Each state is a real Vite project. | Clean isolation, no pollution between tests, doesn't touch dev machine. Parallel execution. | 2026-03-22 |
| D-042 | Three test layers: unit (native, fast), integration (native, snapshots), E2E (Docker, isolated) | Unit + integration run on every save. E2E runs on demand locally and on every CI push. | 2026-03-22 |
| D-043 | Input is optional when operation has no required params | `magia.petstore.listPets.fetch()` and `magia.petstore.listPets.fetch({})` both work. | 2026-03-22 |
| D-044 | Operation naming: use `operationId` by default, with optional custom naming function | If operationId missing, user can provide `operationName: (method, path) => string` in config. Hey API's default naming used as fallback. | 2026-03-22 |
| D-045 | GraphQL schema URL: no built-in headers for introspection. Use async function for auth'd endpoints. | Keep schema config simple. `schema: async () => introspect(url, headers)` handles auth. | 2026-03-22 |
| D-046 | 401 retry / token refresh: out of scope. Users handle via `onError` + their own logic. | Keep magia focused on codegen + proxy. Auth retry is app-level concern. | 2026-03-22 |
| D-047 | Bundle size: defer to D-029 (lazy imports via Proxy) for large APIs | Manifest compresses well. Lazy loading per API is the real solution for 200+ operations. | 2026-03-22 |
| D-048 | OpenAPI 3.x only. No Swagger 2.0 support. | Hey API handles 3.0 + 3.1. Swagger 2.0 is legacy — users can convert with swagger2openapi. | 2026-03-22 |
| D-049 | MIT license | Standard open source license. | 2026-03-22 |
| D-050 | Start with a spike: hard-coded Proxy + manifest for petstore before building full codegen | Validate DX feels right before investing in the pipeline. | 2026-03-22 |
| D-051 | `.d.ts` path: configurable via `dtsPath` in defineConfig. Default: `src/magia-api.d.ts` if `src/` exists, else `magia-api.d.ts` in project root. | Smart default covers most projects. Configurable for non-standard layouts. | 2026-03-22 |
| D-052 | v1.0 scope: REST only, CLI + Vite plugin, TQ plugin, basic watch. No GraphQL, no typed errors, no testing utils, no SSE, no file uploads, no data transformers. | Ship a usable product fast. GraphQL + advanced features → v1.1. | 2026-03-22 |
| D-053 | Use native fetch in runtime proxy instead of @hey-api/client-fetch | @hey-api/client-fetch is deprecated (bundled into openapi-ts). Native fetch is simpler. Reassess when building interceptors. | 2026-03-22 |

## Research Findings

| Topic | Finding | Date |
|-------|---------|------|
| Hey API | 6M downloads/mo, 4.3k stars. `createClient()` API. 20+ plugins. Built-in SSE + data transformers. Supports multiple specs. | 2026-03-22 |
| graphql-codegen | `codegen()` + `generate()` APIs. Client-preset is modern approach. 2.3M weekly downloads. | 2026-03-22 |
| graphql-request | ~2M downloads/wk. Minimal GraphQL client. Supports SSE subscriptions. TypedDocumentNode support. | 2026-03-22 |
| @hey-api/client-fetch | ~2.8M downloads/mo. Runtime HTTP client for fetch API. Interceptors, auth, error handling. | 2026-03-22 |
| tRPC v11 | Option factories. Recursive Proxy. AbortSignal. Links middleware. SSE via AsyncIterable. Data transformers. | 2026-03-22 |
| TanStack Router | Single generated file. `declare module` augmentation. Vite plugin generation. | 2026-03-22 |
| Hey API SSE | Built-in `client.sse.*()`. AsyncGenerator. Auto-reconnect with backoff + `Last-Event-ID`. | 2026-03-22 |
| inspira-app | Dual API. Two configs. Manual scripts. Custom wrapper hooks. SSE for AI streaming. | 2026-03-22 |

## Blockers

None currently.

## Deferred Ideas

**Plugins:**
- `apollo()` plugin
- `zod()` plugin
- `msw()` plugin (Tier 4 testing)

**Platform:**
- Non-Vite bundler support (Webpack, Rollup, esbuild — virtual module resolution needed)
- React Native support (`magia-api/react-native` entry point)
- Prefetch/SSR helpers for Next.js/Remix

**Data:**
- GraphQL scalar transforms (DateTime → Date, etc.) — REST transforms work via D-025
- Multi-schema merging for GraphQL federation
- Request batching for REST APIs
- Request deduplication (same query in-flight → return same promise)

**DX:**
- gql.tada as alternative GraphQL mode
- Lazy imports via Proxy (D-029)
- Schema diffing — show added/removed/modified operations on schema change, alert on breaking changes
- Schema validation at startup — warn if runtime responses don't match types (dev only)
- DevTools browser extension — visual inspector for operations, cache state, active subscriptions
- Storybook integration — auto-generate stories with faker data

**Runtime:**
- Custom error mapping (ApplicationError-style)
- Rate limiting — per-API rate limit config, queue excess requests
- Retry with backoff — configurable retry strategy per API (like tRPC retryLink)
- Offline support — queue mutations when offline, replay when online
- OpenTelemetry / Observability — auto-instrument operations with spans, traces

## Lessons

- inspira-app ceremony is exactly what magia eliminates.
- tRPC v11 option factories = less lock-in, standard TanStack Query API.
- Plugin architecture > flags.
- Opinionated > configurable for codegen internals.
- Hey API > Kubb: broader adoption, built-in transformers + SSE.
- SSE/subscriptions must share the same `.subscribe()` API across REST and GraphQL.
- Zero visible files: `node_modules/.magia/` + one `.d.ts` in `src/`.
- Manifest-based Proxy + virtual module = no generated fetcher files + browser-compatible.
- Single package with entry points > monorepo for this scope.
