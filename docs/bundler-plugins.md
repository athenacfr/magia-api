# Bundler Plugins

magia-api provides plugins for all major bundlers. Each plugin triggers codegen at build start.

## Vite

```typescript
// vite.config.ts
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [magiaApi()],
});
```

See [Vite Plugin](vite-plugin.md) for full details (watch mode, HMR, etc.).

## Rollup

```typescript
// rollup.config.js
import { magiaApi } from "magia-api/rollup";

export default {
  plugins: [magiaApi()],
};
```

Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory |

## Webpack

```typescript
// webpack.config.js
import { MagiaApiPlugin } from "magia-api/webpack";

export default {
  plugins: [new MagiaApiPlugin()],
};
```

Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory |
| `force` | `boolean` | `false` | Force regeneration (ignore cache) |

## esbuild

```typescript
// build.js
import { magiaApi } from "magia-api/esbuild";
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  plugins: [magiaApi()],
});
```

Options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string` | `process.cwd()` | Working directory |
| `force` | `boolean` | `false` | Force regeneration (ignore cache) |

## Programmatic API

For custom build scripts or unsupported bundlers:

```typescript
import { generate, resolveConfig } from "magia-api/codegen";

const { config } = await resolveConfig();
const result = await generate({ config });

console.log(result.apis); // { petstore: { operations: 5, ... } }
```

## Tree-Shaking

The generated `magia.gen.ts` exports per-API manifest constants. If your bundler supports tree-shaking, unused APIs are eliminated:

```typescript
// Only petstoreManifest is included in the bundle
import { petstoreManifest } from "./magia.gen";
import { createMagia } from "magia-api";

export const magia = createMagia({
  manifest: { petstore: petstoreManifest },
  apis: { petstore: { baseUrl: "/api" } },
});
```

The full `manifest` export composes all per-API manifests — use it when you need all APIs.
