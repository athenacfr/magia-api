# Vite Plugin

The Vite plugin triggers codegen automatically — no manual generation step needed.

## Setup

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [magiaApi()],
});
```

## How It Works

1. **Build/Serve start** — Plugin reads `magia.config.ts` and runs the full codegen pipeline
2. **Schema watching** (dev only) — Local schema files are watched with debounce (200ms)
3. **HMR** — `magia.gen.ts` is in `src/`, so Vite auto-detects changes and triggers HMR
4. **Incremental** — Unchanged schemas are skipped (hash-based)

## Dev Mode

In dev mode (`vite dev`), the plugin:

- Generates on server start
- Watches local schema files for changes
- Re-generates only the changed API
- Vite HMR picks up the `magia.gen.ts` change automatically

```
[magia-api] Generated 5 operations from 2 API(s), 1 unchanged (skipped)
[magia-api] Schema changed: petstore, regenerating...
```

## Build Mode

In build mode (`vite build`), the plugin:

- Generates on build start
- No file watchers
- Fails the build if any API has errors

## Generated Files

| File | Location | Gitignored |
|------|----------|------------|
| `magia.gen.ts` | `src/` (configurable via `output`) | Yes |
| Types + manifest | `node_modules/.magia/` | Auto (node_modules) |
| Checksums | `node_modules/.magia/checksums.json` | Auto (node_modules) |
