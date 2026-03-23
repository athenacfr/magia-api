# API Reference

All public exports from magia-api.

## Entry Points

| Entry | Import | Description |
|-------|--------|-------------|
| `magia-api` | `import { createMagia, defineConfig, ... } from "magia-api"` | Core runtime + config |
| `magia-api/vite` | `import { magiaApi } from "magia-api/vite"` | Vite plugin |
| `magia-api/rollup` | `import { magiaApi } from "magia-api/rollup"` | Rollup plugin |
| `magia-api/webpack` | `import { MagiaApiPlugin } from "magia-api/webpack"` | Webpack plugin |
| `magia-api/esbuild` | `import { magiaApi } from "magia-api/esbuild"` | esbuild plugin |
| `magia-api/codegen` | `import { generate, resolveConfig } from "magia-api/codegen"` | Programmatic codegen |
| `magia-api/test` | `import { createTestMagia } from "magia-api/test"` | Testing utilities |
| `magia-api/cli` | `npx magia-api` | CLI binary |

## Core (`magia-api`)

### `defineConfig(config)`

Identity function for type inference in `magia.config.ts`.

```typescript
import { defineConfig } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: { ... },
});
```

**Parameters:**
- `config: DefineConfigInput` — See [Configuration](configuration.md)

**Returns:** `DefineConfigInput`

---

### `createMagia(config)`

Create the typed proxy client.

```typescript
import { createMagia } from "magia-api";
import { manifest } from "./magia.gen";

const magia = createMagia({
  manifest,
  apis: { petstore: { baseUrl: "/api" } },
});
```

**Parameters:**
- `config: MagiaConfig<TManifest>` — Runtime config with manifest

**Returns:** `MagiaClient` (typed via module augmentation)

---

### `tanstackQuery()`

Compile-time plugin marker for TanStack Query support.

```typescript
plugins: [tanstackQuery()]
```

**Returns:** `{ name: "tanstackQuery" }`

---

### `MagiaError`

Error class for all API failures. See [Error Handling](error-handling.md).

## Types

### Config Types

| Type | Description |
|------|-------------|
| `DefineConfigInput` | Shape of `magia.config.ts` default export |
| `ApiDefConfig` | Union of `RestApiDefConfig \| GraphQLApiDefConfig` |
| `RestApiDefConfig` | REST API config (`type: "rest"`, `schema`, `plugins?`) |
| `GraphQLApiDefConfig` | GraphQL API config (`type: "graphql"`, `schema`, `documents`) |
| `SchemaSource` | `string \| () => Promise<string> \| SchemaScript` |
| `SchemaScript` | `{ command: string; output: string }` |
| `MagiaPlugin` | `{ name: string }` |

### Runtime Types

| Type | Description |
|------|-------------|
| `MagiaConfig<TManifest>` | `createMagia()` config — `manifest`, `apis`, `onError?` |
| `MagiaApiConfig` | Per-API config — `baseUrl`, `fetchOptions?` |
| `MagiaClient` | Client interface (augmented by generated `.d.ts`) |
| `MagiaFetchOptions` | `{ signal?, raw?, query?, headers? }` |
| `MagiaRawResponse<T>` | `{ data: T, headers: Headers, status: number }` |

### Operation Types (Module Augmentation)

| Type | Description |
|------|-------------|
| `MagiaOperation<TInput, TOutput, TErrors>` | GET operations — `.fetch()`, `.isError()` |
| `MagiaMutation<TInput, TOutput, TErrors>` | POST/PUT/DELETE operations — `.fetch()`, `.isError()` |
| `MagiaTanStackQuery<TInput, TOutput>` | `.queryOptions()`, `.queryKey()` |
| `MagiaTanStackMutation<TInput, TOutput>` | `.mutationOptions()`, `.mutationKey()` |
| `MagiaTanStackInfiniteQuery<TInput, TOutput>` | `.infiniteQueryOptions()` (future) |

### Manifest Types

| Type | Description |
|------|-------------|
| `Manifest` | `Record<string, ManifestApi>` |
| `ManifestApi` | `{ plugins: MagiaPlugin[], operations: Record<string, ManifestEntry> }` |
| `ManifestEntry` | `RestManifestEntry \| GraphQLManifestEntry` |
| `ParamLocation` | `"path" \| "query" \| "body" \| "header"` |

## Client Methods

### On operations (`magia.<api>.<operation>`)

| Method | Description |
|--------|-------------|
| `.fetch(input?, opts?)` | Execute the API call |
| `.isError(error, code)` | Type guard for `MagiaError` with specific status/code |

### On operations (with `tanstackQuery()` plugin)

| Method | Description |
|--------|-------------|
| `.queryOptions(input?, opts?)` | Returns `{ queryKey, queryFn }` for `useQuery()` |
| `.queryKey(input?)` | Returns hierarchical query key |
| `.mutationOptions(opts?)` | Returns `{ mutationFn, mutationKey }` for `useMutation()` |
| `.mutationKey()` | Returns mutation key |

### On API namespace (`magia.<api>`)

| Method | Description |
|--------|-------------|
| `.pathKey()` | Returns `["magia", "<api>"]` for broad cache invalidation |

### On root (`magia`)

| Method | Description |
|--------|-------------|
| `.shorthands()` | Returns `{ <api>: proxy, ... }` for destructuring |

## Codegen (`magia-api/codegen`)

### `generate(options)`

Run the codegen pipeline programmatically.

```typescript
import { generate } from "magia-api/codegen";

const result = await generate({
  config,
  cwd: process.cwd(),
  filter: ["petstore"],
  force: false,
});
```

**Parameters:**
- `config: DefineConfigInput` — The magia config
- `cwd?: string` — Working directory (default: `process.cwd()`)
- `filter?: string[]` — Only generate these APIs
- `force?: boolean` — Ignore checksums, regenerate all

**Returns:** `GenerateResult`
- `genFilePath: string` — Path to generated `magia.gen.ts`
- `apis: Record<string, { operations: number, typesDir: string, diff: OperationDiff }>`
- `skipped: string[]` — APIs skipped (unchanged schema)
- `errors: Array<{ apiName: string, error: Error }>`

### `resolveConfig(cwd?)`

Find and load `magia.config.ts`.

```typescript
import { resolveConfig } from "magia-api/codegen";

const { config, configPath } = await resolveConfig();
```

### `loadConfig(configPath)`

Load config from a specific path.

### `findConfigFile(cwd?)`

Find the config file path without loading it. Returns `null` if not found.
