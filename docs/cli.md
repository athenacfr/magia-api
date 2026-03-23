# CLI Reference

magia-api includes a CLI for generation outside of Vite (CI, scripts, etc.).

## Commands

### `generate`

```bash
magia-api generate [api...] [--force]
```

Generate types and manifest from your config. Default command (runs if no command specified).

| Argument | Description |
|----------|-------------|
| `api...` | Optional API names to generate (default: all) |
| `--force` | Force regeneration, ignore checksums |

```bash
magia-api generate              # All APIs, skip unchanged
magia-api generate --force      # All APIs, force regeneration
magia-api generate petstore     # Only petstore
magia-api                       # Same as 'generate'
```

Output:
```
Config: /path/to/magia.config.ts
  petstore: 5 operations
  users: unchanged (skipped)
Generated: /path/to/src/magia.gen.ts
Done in 234ms
```

### `validate`

```bash
magia-api validate
```

Validate your config and schemas without generating code. Useful for CI checks.

- Verifies config file exists and has valid structure
- Resolves each schema source
- Parses REST schemas to validate OpenAPI structure
- Reports path count per API

```
Config: /path/to/magia.config.ts
  petstore: valid (3 paths)
  users: valid (5 paths)
All 2 API(s) valid
```

Exits with code 1 if any API fails validation.

### `init`

```bash
magia-api init
```

Creates a starter `magia.config.ts` in the current directory. Fails if the file already exists.

## CI Usage

```yaml
# GitHub Actions
steps:
  - run: npx magia-api generate
  - run: tsc --noEmit  # Type-check with generated types
```

The `generate` command exits with code 1 if any API fails. In CI, always run without `--force` to benefit from incremental caching across runs (if `node_modules` is cached).

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Generation/validation error |
