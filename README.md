# magia-api

Zero-ceremony typed API client generation for Vite.

Define your APIs once. Get fully typed `fetch()`, TanStack Query options, and cache keys — all from a single config file. No codegen scripts, no manual types, no boilerplate.

```typescript
// magia.config.ts
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

```typescript
// src/lib/magia.ts
import { createMagia } from "magia-api";
import { manifest } from "./magia.gen";

export const magia = createMagia({
  manifest,
  apis: {
    petstore: { baseUrl: "https://petstore3.swagger.io/api/v3" },
  },
});
```

```typescript
// Fully typed — zero manual types
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });

// TanStack Query — standard API, no wrappers
const { data } = useQuery(magia.petstore.getPetById.queryOptions({ petId: 1 }));

// Cache invalidation
queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });
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

- **Zero ceremony** — No codegen scripts. Vite plugin generates on start.
- **Fully typed** — TypeScript types from your OpenAPI/GraphQL schema. No manual types.
- **TanStack Query** — `queryOptions()`, `queryKey()`, `mutationOptions()` via plugin.
- **Flat parameters** — `{ petId: 1, status: "available" }` auto-mapped to path/query/body.
- **Incremental** — Hash-based skip for unchanged schemas. Fast rebuilds.
- **Multiple APIs** — One config, many APIs. REST and GraphQL.
- **CLI** — `magia-api generate` for CI. `magia-api validate` for checks.
- **Error handling** — `MagiaError` with typed status codes and `.isError()` type guard.

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

- [Configuration](docs/configuration.md)
- [Runtime Client](docs/runtime-client.md)
- [Schema Resolution](docs/schema-resolution.md)
- [TanStack Query Plugin](docs/plugins/tanstack-query.md)
- [Error Handling](docs/error-handling.md)
- [CLI Reference](docs/cli.md)
- [Vite Plugin](docs/vite-plugin.md)

### Guides

- [REST API](docs/guides/rest-api.md)
- [GraphQL API](docs/guides/graphql-api.md)
- [Multiple APIs](docs/guides/multiple-apis.md)
- [CI Setup](docs/guides/ci-setup.md)

## License

MIT
