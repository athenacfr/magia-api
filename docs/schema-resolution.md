# Schema Resolution

magia-api supports multiple schema sources with smart defaults for watching and caching.

## Source Types

### URL

```typescript
schema: "https://petstore3.swagger.io/api/v3/openapi.json"
```

Fetches via HTTP/HTTPS. Supports JSON and YAML.

### Local File

```typescript
schema: "./schemas/petstore.yaml"
```

Reads from the filesystem relative to the config file's directory.

### Async Function

```typescript
schema: async () => {
  const res = await fetch("https://internal.api/spec", {
    headers: { Authorization: `Bearer ${process.env.TOKEN}` },
  });
  return res.text();
}
```

Full control over how the schema is fetched. Useful for authenticated endpoints, cloud storage, etc.

### Shell Script

```typescript
schema: {
  command: "./scripts/fetch-spec.sh",
  output: "./schemas/output.json",
}
```

Runs the command, then reads the output file. Useful for complex fetching logic or legacy scripts.

## Smart Defaults

| Source | Watch | Cache |
|--------|-------|-------|
| Local file | `true` (file watcher) | `disabled` |
| localhost/127.*/10.*/192.168.* URL | `true` (poll) | `disabled` |
| Remote URL | `false` | `{ ttl: "1h" }` |
| Async function | `false` | `{ ttl: "1h" }` |
| Shell script | `false` | `{ ttl: "1h" }` |

Override per-API:

```typescript
petstore: {
  type: "rest",
  schema: "https://api.example.com/spec.json",
  schemaWatch: true,        // override: watch this remote URL
  schemaCache: "disabled",  // override: no caching
}
```

## Environment Variable Override

Override any API's schema at build time:

```bash
MAGIA_PETSTORE_SCHEMA=./schemas/petstore-frozen.json
```

Format: `MAGIA_<APINAME>_SCHEMA` (API name uppercased).

Takes precedence over the config file's `schema` field. Useful for CI where you want to pin a local schema.

## Incremental Builds

magia-api hashes each resolved schema (SHA-256) and stores checksums in `node_modules/.magia/checksums.json`. On subsequent runs, unchanged schemas are skipped entirely.

Force full regeneration:

```bash
magia-api generate --force
```

Or delete `node_modules/.magia/checksums.json`.

## Schema Diffing

magia-api tracks operation names between generations. When operations are added or removed, the CLI and Vite plugin report the changes:

```
  petstore: 5 operations, +1 new, -2 removed
    removed: deletePet, updatePet
```

This helps catch breaking changes when a backend schema is updated. Removed operations mean existing code may reference endpoints that no longer exist.
