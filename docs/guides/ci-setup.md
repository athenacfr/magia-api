# Guide: CI Setup

Run magia-api codegen in CI to type-check your generated types.

## GitHub Actions

```yaml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install
      - run: npx magia-api generate
      - run: pnpm tsc --noEmit
      - run: pnpm test
```

## Key Points

1. **Generate before type-check** — `magia.gen.ts` is gitignored, so CI must generate it
2. **Incremental caching** — If you cache `node_modules`, checksums persist across runs. Unchanged schemas skip regeneration.
3. **Validate only** — Use `magia-api validate` for a quick schema check without full generation

## Schema Pinning

For reproducible builds, pin schemas to local files in CI:

```bash
MAGIA_PETSTORE_SCHEMA=./schemas/petstore-frozen.json npx magia-api generate
```

Or commit schema files and reference them directly in config.

## Validate in Pre-commit

```bash
npx magia-api validate
```

Fast check that all schemas resolve and parse correctly. No code generation.
