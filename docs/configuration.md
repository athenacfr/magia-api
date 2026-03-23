# Configuration

magia-api uses a single config file: `magia.config.ts`.

## `defineConfig()`

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
    github: {
      type: "graphql",
      schema: "https://api.github.com/graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
```

## Global Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `output` | `string` | yes | Path for generated `magia.gen.ts` |
| `apis` | `Record<string, ApiDefConfig>` | yes | API definitions |

## Per-API Options (REST)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"rest"` | yes | API type |
| `schema` | `SchemaSource` | yes | OpenAPI 3.x schema source |
| `plugins` | `MagiaPlugin[]` | no | Plugins to enable |
| `schemaWatch` | `boolean` | no | Override auto-detected watch behavior |
| `schemaCache` | `"disabled" \| { ttl: string }` | no | Override auto-detected cache behavior |
| `operationName` | `(method, path, operationId?) => string` | no | Custom operation naming |

## Per-API Options (GraphQL)

Same as REST, plus:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"graphql"` | yes | API type |
| `documents` | `string \| string[]` | yes | Glob patterns for `.graphql` files |

## Schema Sources

See [Schema Resolution](schema-resolution.md) for full details.

```typescript
// URL
schema: "https://api.example.com/openapi.json"

// Local file (JSON, YAML)
schema: "./schemas/api.yaml"

// Async function
schema: async () => {
  const res = await fetch("https://internal/spec", { headers: { auth: "..." } })
  return res.text()
}

// Shell script
schema: { command: "./scripts/fetch-spec.sh", output: "./spec.json" }
```

## Plugins

Plugins are compile-time only — they extend the generated types and manifest.

```typescript
import { tanstackQuery } from "magia-api";

plugins: [tanstackQuery()]
```

## Custom Operation Names

By default, operations use `operationId` from the spec. Override with:

```typescript
operationName: (method, path, operationId) => {
  if (operationId) return operationId;
  return `${method.toLowerCase()}${path.replace(/[/{}-]/g, "_")}`;
}
```

## Config File Discovery

The CLI and Vite plugin search for the config file from the current directory upward:

1. `magia.config.ts`
2. `magia.config.js`
3. `magia.config.mts`
4. `magia.config.mjs`

## Environment Variable Override

Override any API's schema source at build time:

```bash
MAGIA_PETSTORE_SCHEMA=./schemas/petstore-frozen.json
```

Format: `MAGIA_<APINAME>_SCHEMA` (uppercase API name).
