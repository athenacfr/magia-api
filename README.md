# magia-api

Zero-ceremony typed API client generation for Vite.

Define your APIs once. Get fully typed `fetch()`, TanStack Query options, and cache keys — all from a single config file. No codegen scripts, no manual types, no boilerplate.

## Why Magia?

Every frontend team eventually writes the same glue: fetch wrappers, hand-maintained types, query-key factories, error normalization. Magia replaces all of that with a single config file.

Point it at your OpenAPI or GraphQL schema. The bundler plugin generates types on start. The runtime client gives you typed fetch, TanStack Query integration, interceptors, and error handling — all through one API surface. REST and GraphQL work the same way.

**What makes it different from using the underlying tools directly:**

- **One config, full stack** — You don't wire together a codegen tool, a fetch library, a query-key factory, and an error wrapper. Magia is the entire layer between your API and your components.
- **You never import the internals** — The codegen and fetch layers are implementation details. Your code depends on `magia-api`, not on the tools underneath.
- **It stays out of your way** — No runtime overhead, no custom protocols, no vendor lock-in. It generates standard TypeScript and uses standard fetch. Eject anytime by keeping the generated file.

```typescript
// REST — fully typed from OpenAPI schema
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });

// GraphQL — same API, same DX
const user = await magia.github.GetUser.fetch({ login: "octocat" });

// Safe fetch — no try/catch needed
const { data, error } = await magia.petstore.getPetById.safeFetch({ petId: 1 });

// TanStack Query — standard API, no wrappers
const { data } = useQuery(magia.petstore.getPetById.queryOptions({ petId: 1 }));
const { data } = useQuery(magia.github.GetUser.queryOptions({ login: "octocat" }));
```

## Quick Start

### Install

```bash
npm install magia-api
```

### 1. Create config

```bash
npx magia-api init
```

Or manually create `magia.config.ts`:

```typescript
import { defineConfig, tanstackQuery } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    petstore: {
      type: "rest",
      schema: "https://petstore3.swagger.io/api/v3/openapi.json",
      plugins: [tanstackQuery()],
    },
  },
});
```

### 2. Add Vite plugin

```typescript
// vite.config.ts
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [magiaApi()],
});
```

### 3. Create runtime client

```typescript
// src/lib/magia.ts
import { createMagia } from "magia-api";
import { manifest } from "./magia.gen";

export const magia = createMagia({
  manifest,
  apis: {
    petstore: {
      baseUrl: import.meta.env.VITE_PETSTORE_URL,
    },
  },
});
```

### 4. Use it

```typescript
import { useQuery, useMutation } from "@tanstack/react-query";
import { magia } from "./lib/magia";

// Queries
const { data } = useQuery(magia.petstore.getPetById.queryOptions({ petId: 1 }));

// Mutations
const { mutate } = useMutation(magia.petstore.createPet.mutationOptions());

// Plain fetch
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
```

### 5. Add to `.gitignore`

```
src/magia.gen.ts
```

## Features

- **Zero ceremony** — No codegen scripts. Bundler plugin generates on start.
- **Any bundler** — Vite, Rollup, Webpack, esbuild. Or CLI for scripts and CI.
- **Fully typed** — TypeScript types from your OpenAPI/GraphQL schema. No manual types.
- **TanStack Query** — `queryOptions()`, `queryKey()`, `mutationOptions()` via plugin.
- **Flat parameters** — `{ petId: 1, status: "available" }` auto-mapped to path/query/body.
- **Incremental** — Hash-based skip for unchanged schemas. Fast rebuilds.
- **Tree-shakeable** — Per-API manifest exports. Only bundle what you use.
- **Multiple APIs** — One config, many APIs. REST and GraphQL.
- **CLI** — `magia-api generate` for CI. `magia-api validate` for checks.
- **Error handling** — `MagiaError`, `.safeFetch()`, `transformError`, typed `.isError()` guard.
- **Interceptors** — Per-API `onRequest`/`onResponse` hooks with typed context. Inject auth, trace requests.
- **Retry & timeout** — Per-API `retry` and `timeout` config.

## Schema Sources

```typescript
apis: {
  // URL
  remote: { type: "rest", schema: "https://api.example.com/openapi.json" },
  // Local file
  local: { type: "rest", schema: "./schemas/api.yaml" },
  // Async function
  dynamic: { type: "rest", schema: async () => { /* fetch from anywhere */ } },
  // Shell script
  legacy: { type: "rest", schema: { command: "./scripts/fetch-spec.sh", output: "./spec.json" } },
}
```

Env var override: `MAGIA_PETSTORE_SCHEMA=./local-spec.json`

## CLI

```bash
magia-api generate              # Generate all (skip unchanged)
magia-api generate --force      # Force regenerate all
magia-api generate petstore     # Generate single API
magia-api validate              # Validate config and schemas
magia-api init                  # Scaffold config file
```

## Documentation

### Getting Started

- [Design Principles](docs/design-principles.md) — Why Magia works the way it does
- [Configuration](docs/configuration.md) — `defineConfig()`, schema sources, plugins, custom operation names
- [Runtime Client](docs/runtime-client.md) — `createMagia()`, fetch, safeFetch, interceptors, context, headers
- [Error Handling](docs/error-handling.md) — `MagiaError`, `.safeFetch()`, `.isError()`, `transformError`, abort vs timeout
- [TanStack Query Plugin](docs/plugins/tanstack-query.md) — `queryOptions`, `queryKey`, `mutationOptions`, `infiniteQueryOptions`

### Infrastructure

- [Schema Resolution](docs/schema-resolution.md) — URL, file, async function, script sources, caching, incremental diffing
- [Bundler Plugins](docs/bundler-plugins.md) — Vite, Rollup, Webpack, esbuild
- [CLI Reference](docs/cli.md) — `generate`, `validate`, `init`
- [Testing](docs/testing.md) — `createTestMagia`, mocking, React Testing Library

### Guides

- [REST API](docs/guides/rest-api.md) — End-to-end REST example
- [GraphQL API](docs/guides/graphql-api.md) — End-to-end GraphQL example
- [Multiple APIs](docs/guides/multiple-apis.md) — Multi-API setup
- [CI Setup](docs/guides/ci-setup.md) — CI pipeline configuration

### Reference

- [API Reference](docs/api-reference.md) — All exports, types, methods

## License

MIT
