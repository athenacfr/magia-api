# State

## Decisions

| ID | Decision | Rationale | Date |
|----|----------|-----------|------|
| D-001 | Use Hey API + graphql-codegen as internal SDKs | Battle-tested, never exposed to users. | 2026-03-22 |
| D-002 | Vite plugin as primary DX. Vite only first. | "No codegen step" experience. Non-Vite support deferred. | 2026-03-22 |
| D-003 | Opinionated by design — no user config of codegen internals | Users configure: type, schema, documents, magia plugins. | 2026-03-22 |
| D-004 | Schema input: URLs, files, async functions, scripts. No built-in cloud. | Keep core lean. | 2026-03-22 |
| D-005 | Hey API as internal REST SDK | 6M downloads/mo, built-in data transformers + SSE. | 2026-03-22 |
| D-006 | ~~Zero visible files~~ → Two gitignored files: `src/magia.gen.ts` (manifest) + `src/magia-api.d.ts` (types). Internals in `node_modules/.magia/`. | TanStack Router-style generated file. Works in Vite + Node + any bundler. No virtual modules needed. | 2026-03-22 |
| D-007 | Import from `magia-api` package, not generated paths | `declare module 'magia-api'` augmentation. Manifest imported from `./magia.gen`. | 2026-03-22 |
| D-008 | Namespace: `magia.<api>.<operation>.fetch()` with plugin extensions | tRPC v11 pattern. | 2026-03-22 |
| D-009 | TanStack Query as a plugin (`tanstackQuery()`) | Plugin architecture: base generates fetch, plugins extend. | 2026-03-22 |
| D-010 | SSE is core (REST), subscriptions are core (GraphQL). Same `.subscribe()` API. | v1.1 — deferred from v1. | 2026-03-22 |
| D-011 | tRPC v11 option factories (not wrapped hooks) | `useQuery(magia.x.y.queryOptions())`. Standard TanStack Query API. | 2026-03-22 |
| D-012 | Unified DX: REST and GraphQL identical API surface | User never knows which protocol. | 2026-03-22 |
| D-013 | ~~Manifest bundled via Vite virtual module~~ → Manifest is a real file (`src/magia.gen.ts`). Vite plugin intercepts import for HMR. | Works everywhere: Vite, Node, any bundler. No virtual module magic. | 2026-03-22 |
| D-014 | Runtime URL config via env vars | `createMagia({ apis: { x: { baseUrl: import.meta.env.VITE_X_URL } } })` | 2026-03-22 |
| D-015 | Hierarchical query keys: `["magia", "<api>", "<op>", input?]` | tRPC-style partial matching. | 2026-03-22 |
| D-016 | TanStack Query config is user's job via standard QueryClient | No `queryDefaults` in magia. | 2026-03-22 |
| D-017 | No `<MagiaProvider>` — standard `<QueryClientProvider>` | Option factories need no magia-specific context. | 2026-03-22 |
| D-018 | CLI `magia-api generate` for CI | Generates `src/magia.gen.ts` + `src/magia-api.d.ts` + `node_modules/.magia/`. | 2026-03-22 |
| D-019 | Smart schema watch: local + localhost auto-watched, remote cached with TTL | Smart defaults. | 2026-03-22 |
| D-020 | `MAGIA_<API>_SCHEMA` env var overrides schema source | Build-time only. | 2026-03-22 |
| D-021 | Schema cache in `node_modules/.magia/schemas/` | Wiped on install, regenerated. | 2026-03-22 |
| D-022 | Dev: auto-refetch + retry on codegen error. CI: fail immediately. | Stale cache shouldn't block dev. | 2026-03-22 |
| D-023 | Comprehensive docs on GitHub | Good docs are part of the product. | 2026-03-22 |
| D-024 | AbortSignal on all `.fetch()` calls | Standard Web API. | 2026-03-22 |
| D-025 | Data transformers built from OpenAPI `format` fields | v1.1 — deferred from v1. | 2026-03-22 |
| D-026 | Type inference: `InferInput<Api, Op>` and `InferOutput<Api, Op>` | Extract types by API + operation name. | 2026-03-22 |
| D-027 | Typed errors from OpenAPI error responses + GraphQL error extensions | v1.1 — deferred from v1. | 2026-03-22 |
| D-028 | Separate config file (`magia-api.config.ts`) auto-discovered | CLI needs it independently of Vite. | 2026-03-22 |
| D-029 | Lazy imports via Proxy (future) | Dynamic import on first call. | 2026-03-22 |
| D-030 | `{ raw: true }` option for response headers access | Returns `{ data, headers, status }`. | 2026-03-22 |
| D-031 | Single npm package `magia-api` with multiple entry points | `magia-api`, `magia-api/vite`, `magia-api/cli`, `magia-api/test`. Not a monorepo. | 2026-03-22 |
| D-032 | ~~`@hey-api/client-fetch` as REST runtime client~~ → Native `fetch` | @hey-api/client-fetch deprecated. Native fetch is simpler for v1. | 2026-03-22 |
| D-033 | `graphql-request` as GraphQL runtime client | v1.1. | 2026-03-22 |
| D-034 | Flat parameter mapping, auto-detected from manifest | path > query > body priority. Explicit `{ query, headers }` override in options for edge cases. | 2026-03-22 |
| D-035 | File uploads auto-detected from OpenAPI `multipart/form-data` | v1.1. | 2026-03-22 |
| D-036 | `tanstackQuery()` plugin includes `infiniteQueryOptions` for paginated endpoints | v1.1 — queryOptions/queryKey/mutationOptions only in v1. | 2026-03-22 |
| D-037 | Build magia-api package with tsup | Battle-tested for library builds with multiple entry points. | 2026-03-22 |
| D-038 | Testing utilities in `magia-api/test` | v1.1. | 2026-03-22 |
| D-039 | GraphQL subscriptions via SSE transport only | v1.1. | 2026-03-22 |
| D-040 | ~~`createMagia()` auto-imports manifest~~ → User imports manifest explicitly from `./magia.gen` | Works in Vite + Node + any bundler. No magic, no virtual modules. TanStack Router-style. | 2026-03-22 |
| D-041 | E2E tests run in Docker containers | v1.1. | 2026-03-22 |
| D-042 | Three test layers: unit (native, fast), integration (native, snapshots), E2E (Docker, isolated) | Unit + integration in v1. E2E in v1.1. | 2026-03-22 |
| D-043 | Input is optional when operation has no required params | `magia.petstore.listPets.fetch()` works. | 2026-03-22 |
| D-044 | Operation naming: use `operationId` by default, with optional custom naming function | Fallback: method + path slug. | 2026-03-22 |
| D-045 | GraphQL schema URL: no built-in headers for introspection. | v1.1. | 2026-03-22 |
| D-046 | 401 retry / token refresh: out of scope. | App-level concern. | 2026-03-22 |
| D-047 | Bundle size: defer to D-029 (lazy imports via Proxy) for large APIs | v1.1. | 2026-03-22 |
| D-048 | OpenAPI 3.x only. No Swagger 2.0 support. | Hey API handles 3.0 + 3.1. | 2026-03-22 |
| D-049 | MIT license | Standard open source license. | 2026-03-22 |
| D-050 | ~~Start with a spike~~ → Spike complete. | Validated Proxy + manifest + TQ plugin DX. | 2026-03-22 |
| D-051 | `.d.ts` path: configurable via `dtsPath`. Default: `src/magia-api.d.ts` if `src/` exists, else `./magia-api.d.ts`. | Smart default. | 2026-03-22 |
| D-052 | v1.0 scope: REST only, CLI + Vite plugin, TQ plugin, basic watch. | Ship fast. GraphQL + advanced → v1.1. | 2026-03-22 |
| D-053 | Native fetch in runtime proxy instead of @hey-api/client-fetch | Deprecated package. Native fetch simpler. | 2026-03-22 |
| D-054 | Plugins are compile-time only (`defineConfig`), not passed to `createMagia` at runtime | Manifest stores plugin metadata (e.g. `[tanstackQuery()]`). Proxy reads manifest to activate plugin methods. `MagiaConfig` has `plugins` slot for future runtime plugin options. | 2026-03-22 |
| D-055 | Manifest uses plugin objects `[tanstackQuery()]` not strings | Enables compile-time plugin options in the future. | 2026-03-22 |
| D-056 | Generated manifest file: `src/magia.gen.ts` (gitignored, TanStack Router-style) | Real file in user's source tree. Works everywhere: Vite, Node, any bundler. User imports `from './magia.gen'`. Vite plugin intercepts for HMR in dev. | 2026-03-22 |

## Research Findings

| Topic | Finding | Date |
|-------|---------|------|
| Hey API | 6M downloads/mo, 4.3k stars. `createClient()` API. 20+ plugins. Built-in SSE + data transformers. Supports multiple specs. | 2026-03-22 |
| Hey API SDK | `createClient({ input, output, plugins })` — programmatic API. `@hey-api/typescript` plugin for types only. Output: `types.gen.ts`. | 2026-03-22 |
| graphql-codegen | `codegen()` + `generate()` APIs. Client-preset is modern approach. 2.3M weekly downloads. | 2026-03-22 |
| graphql-request | ~2M downloads/wk. Minimal GraphQL client. Supports SSE subscriptions. TypedDocumentNode support. | 2026-03-22 |
| @hey-api/client-fetch | Deprecated — bundled into @hey-api/openapi-ts from v0.73.0. All versions deprecated on npm. | 2026-03-22 |
| tRPC v11 | Option factories. Recursive Proxy. AbortSignal. Links middleware. SSE via AsyncIterable. Data transformers. | 2026-03-22 |
| TanStack Router | Single generated `.gen.ts` file in user's source. `declare module` augmentation. Vite plugin generation. User imports generated route tree. | 2026-03-22 |
| inspira-app | Dual API. Two configs. Manual scripts. Custom wrapper hooks. SSE for AI streaming. | 2026-03-22 |

## Research: Projects to Explore

**GraphQL (gql.tada / zero-codegen approach):**
- https://github.com/0no-co/graphql.web — Lightweight GraphQL spec implementation. Used by gql.tada for type-level parsing.
- https://github.com/0no-co/gql.tada — Zero-codegen GraphQL type inference. Explore for v1.1 GraphQL mode as alternative to graphql-codegen.
- https://github.com/graffle-js/graffle — Modern GraphQL client with typed document nodes, schema-driven types, and extensible architecture. Explore for GraphQL runtime client patterns.

**REST (Hey API internals):**
- https://github.com/hey-api/openapi-ts — Clone and explore project structure, plugin architecture, config system, and codegen pipeline. Understand how they handle edge cases, type generation, and the `createClient` programmatic API we depend on.

## Blockers

None currently.

## Deferred Ideas (v1.1+)

**Protocol:**
- GraphQL support (graphql-codegen, graphql-request)
- SSE/Subscriptions (`.subscribe()` API)
- File uploads (multipart/form-data auto-detection)
- Data transformers (OpenAPI `format` → Date, etc.)

**Plugins:**
- `apollo()` plugin
- `zod()` plugin
- `msw()` plugin (Tier 4 testing)
- `infiniteQueryOptions` for paginated endpoints

**Error Handling:**
- `MagiaError` class + `.isError()` type guards
- Typed errors from OpenAPI error responses
- Custom error mapping

**Testing:**
- `createTestMagia`, `mockOperation`, `createFakerMagia`
- E2E tests in Docker

**Platform:**
- Non-Vite bundler support (Webpack, Rollup, esbuild)
- React Native support
- Prefetch/SSR helpers for Next.js/Remix

**DX:**
- gql.tada as alternative GraphQL mode
- Lazy imports via Proxy (D-029)
- Schema diffing / breaking change alerts
- DevTools browser extension
- Incremental / hash-based rebuilds

**Runtime:**
- Rate limiting per API
- Retry with backoff
- Offline support (queue mutations)
- OpenTelemetry / Observability

## Implementation Status

| Feature | Status | Notes |
|---------|--------|-------|
| F-001 defineConfig | **Done** | Types + config loader (jiti) |
| F-002 Schema Resolution | **Done** | URL, file, async fn, script. Env override. Smart defaults. |
| F-003 Codegen Engine (REST) | **Done** | Hey API types + manifest gen + .d.ts gen |
| F-004 Plugin system | **Done** | tanstackQuery() compile-time, manifest metadata |
| F-005 Runtime client | **Done** | Recursive Proxy, flat param mapping, native fetch |
| F-006 Type generation | **Done** | .d.ts augmentation with TQ intersections |
| F-007 CLI | **Done** | `magia-api generate` with filtering |
| F-008 Vite plugin | **Done** | Codegen on start, schema watching |
| F-009 Basic watch | **Done** | Local file watching with debounce |
| Spike | **Done** | Validated DX with hand-crafted petstore |
| **magia.gen.ts refactor** | **In Progress** | Moving manifest from virtual module to real file in src/ |
| Example app (React + TQ) | **In Progress** | examples/basic/ |

## Lessons

- inspira-app ceremony is exactly what magia eliminates.
- tRPC v11 option factories = less lock-in, standard TanStack Query API.
- Plugin architecture > flags.
- Opinionated > configurable for codegen internals.
- Hey API > Kubb: broader adoption, built-in transformers + SSE.
- Single package with entry points > monorepo for this scope.
- @hey-api/client-fetch is fully deprecated — use native fetch.
- Plugins should be compile-time (in defineConfig), not runtime (in createMagia). Manifest carries plugin metadata.
- Virtual modules don't work in Node — real files in src/ (TanStack Router style) work everywhere.
- Manifest import should be explicit (like TanStack Router's routeTree import), not hidden magic.
