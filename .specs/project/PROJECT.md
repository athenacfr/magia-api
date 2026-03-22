# magia-api

## Vision

A unified, zero-ceremony API client generation layer. One config file, opinionated defaults, seamless Vite integration — generates typed REST (OpenAPI) and GraphQL clients without developers thinking about codegen. Zero visible generated files.

## Problem

Today, setting up typed API clients requires:
- Configuring **hey-api** or **kubb** separately for each OpenAPI spec
- Configuring **graphql-codegen** separately for each GraphQL schema
- Running multiple CLI commands or scripts
- Managing generated output directories with dozens of `.gen.ts` files
- Importing from generated paths (`./generated/petstore`)
- No unified config, no shared DX patterns across REST and GraphQL

## Solution

**magia-api** is a Vite plugin + config layer that:
1. Provides a single `magia-api.config.ts` with `defineConfig()` for all APIs
2. Uses **Hey API** and **graphql-codegen** as internal SDKs (never exposed to users)
3. Generates a **manifest** (operation registry) and a single **`.d.ts`** for type augmentation
4. Wraps everything in a **typed Proxy** — `magia.<api>.<operation>.fetch()`
5. Extends per-API capabilities via **plugins** (`tanstackQuery()`) + built-in SSE/subscriptions from spec
6. Runs codegen automatically via Vite plugin — no manual generation step
7. **Zero visible generated files** — all internals hidden in `node_modules/.magia/`, one gitignored `.d.ts` in `src/`

## Principles

- **SDK-first**: Use Hey API and graphql-codegen internally. Never rewrite their logic. Never expose them to users.
- **Opinionated by design**: magia picks the right codegen plugins. Users configure what APIs they have, not how codegen works.
- **Zero visible files**: No `src/generated/` directory. One gitignored `.d.ts` in `src/`, everything else in `node_modules/.magia/`.
- **Unified DX**: REST and GraphQL have identical API surface. `.fetch()`, `.subscribe()`, `.queryOptions()` work the same regardless of protocol.
- **Single source of truth**: One config file defines all API connections.
- **Invisible codegen**: The Vite plugin handles generation — developers write code, types appear.
- **Runtime-first**: Base URLs configured at runtime via Vite's env system.
- **Plugin architecture**: Base generates fetchers + SSE/subscriptions. Plugins extend (TanStack Query, etc.).

## Architecture

```
┌─────────────────────────────────────────────────┐
│  magia-api.config.ts (defineConfig)             │
├─────────────────────────────────────────────────┤
│  Schema Resolution (URL, file, fn, script)      │
├──────────────────────┬──────────────────────────┤
│  Hey API (internal)  │  graphql-codegen (int.)  │
│  → types from spec   │  → types + documents     │
├──────────────────────┴──────────────────────────┤
│  magia-api core                                 │
│  → manifest.ts (bundled via Vite virtual module)│
│  → src/magia-api.d.ts (type augmentation)       │
│  → Typed errors per operation                   │
│  → AbortSignal support                          │
├─────────────────────────────────────────────────┤
│  Core capabilities:                             │
│  → .fetch() — REST + GraphQL                    │
│  → .subscribe() — REST SSE + GraphQL subs       │
│  → File uploads (auto-detected from spec)       │
│  Plugins:                                       │
│  → tanstackQuery(): queryOptions, queryKey,     │
│    mutationOptions, infiniteQueryOptions        │
├─────────────────────────────────────────────────┤
│  Runtime: createMagia() → Proxy object          │
│  → REST: @hey-api/client-fetch                  │
│  → GraphQL: graphql-request                     │
│  → Manifest bundled via Vite virtual module     │
│  → Flat params auto-mapped from manifest        │
│  → Same DX for both protocols                   │
└─────────────────────────────────────────────────┘

Package: single npm package `magia-api`
  magia-api        → core (defineConfig, createMagia, tanstackQuery, MagiaError)
  magia-api/vite   → Vite plugin (magiaApi)
  magia-api/cli    → CLI (magia-api generate)
  magia-api/test   → Testing utilities (createTestMagia, mockOperation)

File layout:
  src/magia-api.d.ts          ← gitignored, auto-generated
  node_modules/.magia/        ← hidden cache + internals
    ├── manifest.ts           ← bundled via virtual:magia-manifest
    ├── internals/            ← Hey API + codegen output
    ├── transformers.ts       ← data transformers from spec
    ├── schemas/              ← cached remote schemas
    └── checksums.json
```

## Target Users

- Frontend/fullstack TypeScript developers using Vite
- Teams consuming multiple REST and GraphQL APIs
- Developers who want typed API clients without config ceremony

## Tech Stack

- **Runtime**: TypeScript, Node.js
- **Build (magia-api package)**: tsup
- **Build (user project)**: Vite plugin
- **REST runtime client** (internal): `@hey-api/client-fetch`
- **GraphQL runtime client** (internal): `graphql-request`
- **REST codegen** (internal): Hey API (`@hey-api/openapi-ts`, `@hey-api/typescript`)
- **GraphQL codegen** (internal): graphql-codegen (`@graphql-codegen/core`, client-preset)
- **Plugin: TanStack Query**: Option factories (queryOptions, mutationOptions, infiniteQueryOptions, queryKey)
- **Core: SSE/Subscriptions**: AsyncIterable streaming with auto-reconnect (REST SSE auto-detected, GraphQL via graphql-request SSE transport)
- **Core: File uploads**: Auto-detected from OpenAPI `multipart/form-data`, accepts `File`/`Blob`
- **Data transformers**: Auto-deserialize from OpenAPI `format` fields
- **Runtime proxy**: Recursive Proxy pattern (inspired by tRPC v11)
- **Testing**: Vitest, `magia-api/test` utilities
- **Package manager**: pnpm
