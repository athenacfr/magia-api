# magia-api

## Vision

A unified, zero-ceremony API client generation layer. One config file, opinionated defaults, seamless Vite integration — generates typed REST (OpenAPI) and GraphQL clients without developers thinking about codegen.

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
3. Generates `src/magia.gen.ts` (manifest + typed exports, gitignored) and `src/magia-api.d.ts` (type augmentation, gitignored)
4. Wraps everything in a **typed Proxy** — `magia.<api>.<operation>.fetch()`
5. Extends per-API capabilities via **plugins** (`tanstackQuery()`) configured at compile time in `defineConfig()`
6. Runs codegen automatically via Vite plugin — no manual generation step
7. **Two gitignored files in `src/`**: `magia.gen.ts` (manifest) + `magia-api.d.ts` (types). Internals hidden in `node_modules/.magia/`

## Principles

- **SDK-first**: Use Hey API and graphql-codegen internally. Never rewrite their logic. Never expose them to users.
- **Opinionated by design**: magia picks the right codegen plugins. Users configure what APIs they have, not how codegen works.
- **Minimal generated files**: Two gitignored files in `src/`. Internals in `node_modules/.magia/`.
- **Unified DX**: REST and GraphQL have identical API surface. `.fetch()`, `.subscribe()`, `.queryOptions()` work the same regardless of protocol.
- **Single source of truth**: One config file defines all API connections.
- **Invisible codegen**: The Vite plugin handles generation — developers write code, types appear.
- **Runtime-first**: Base URLs configured at runtime via env vars.
- **Plugin architecture**: Plugins (`tanstackQuery()`) configured at compile time in `defineConfig()`, extend the runtime proxy via manifest metadata.
- **Works everywhere**: `magia.gen.ts` is a real file — works in Vite, Node, any bundler. No virtual modules.

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
│  magia-api codegen                              │
│  → src/magia.gen.ts (manifest, gitignored)      │
│  → src/magia-api.d.ts (type augmentation)       │
│  → node_modules/.magia/ (internals, cache)      │
├─────────────────────────────────────────────────┤
│  Core capabilities:                             │
│  → .fetch() — REST (v1) + GraphQL (v1.1)        │
│  Plugins (compile-time, in defineConfig):       │
│  → tanstackQuery(): queryOptions, queryKey,     │
│    mutationOptions, infiniteQueryOptions        │
├─────────────────────────────────────────────────┤
│  Runtime: createMagia(config, manifest) → Proxy │
│  → REST: native fetch                           │
│  → Flat params auto-mapped from manifest        │
│  → Plugins activated from manifest metadata     │
└─────────────────────────────────────────────────┘

Package: single npm package `magia-api`
  magia-api        → core (defineConfig, createMagia, tanstackQuery)
  magia-api/vite   → Vite plugin (magiaApi)
  magia-api/cli    → CLI (magia-api generate)
  magia-api/test   → Testing utilities (future)

File layout (user project):
  magia-api.config.ts         ← user-authored config
  src/magia.gen.ts            ← gitignored, auto-generated manifest
  src/magia-api.d.ts          ← gitignored, auto-generated types
  node_modules/.magia/        ← hidden cache + internals
    ├── internals/            ← Hey API type output per API
    ├── schemas/              ← cached remote schemas
    └── checksums.json        ← change detection (future)
```

## User DX

```typescript
// magia-api.config.ts
import { defineConfig, tanstackQuery } from 'magia-api'

export default defineConfig({
  apis: {
    petstore: {
      type: 'rest',
      schema: 'https://petstore3.swagger.io/api/v3/openapi.json',
      plugins: [tanstackQuery()],
    },
  },
})

// src/lib/magia.ts
import { createMagia } from 'magia-api'
import { manifest } from '../magia.gen'

export const magia = createMagia({
  apis: { petstore: { baseUrl: import.meta.env.VITE_PETSTORE_URL } },
}, manifest)

// src/components/PetList.tsx
import { useQuery } from '@tanstack/react-query'
import { magia } from '../lib/magia'

const { data } = useQuery(magia.petstore.findPetsByStatus.queryOptions({ status: 'available' }))
```

## Target Users

- Frontend/fullstack TypeScript developers using Vite
- Teams consuming multiple REST and GraphQL APIs
- Developers who want typed API clients without config ceremony

## Tech Stack

- **Runtime**: TypeScript, Node.js
- **Build (magia-api package)**: tsup
- **Build (user project)**: Vite plugin
- **REST runtime client**: native `fetch` (v1)
- **REST codegen** (internal): Hey API (`@hey-api/openapi-ts`, `@hey-api/typescript`)
- **GraphQL codegen** (internal, v1.1): graphql-codegen (`@graphql-codegen/core`, client-preset)
- **Plugin: TanStack Query**: Option factories (queryOptions, mutationOptions, infiniteQueryOptions, queryKey)
- **Config loading**: jiti (TypeScript config files at runtime)
- **Schema parsing**: yaml (YAML support), native JSON.parse
- **Runtime proxy**: Recursive Proxy pattern (inspired by tRPC v11)
- **Testing**: Vitest
- **Package manager**: pnpm
