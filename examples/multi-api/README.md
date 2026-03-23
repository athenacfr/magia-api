# Multi-API Example

REST (Petstore) + GraphQL (GitHub) in a single project.

## What this shows

- Multiple APIs in one config — REST and GraphQL side by side
- Shared runtime client with per-API configuration
- Same `queryOptions()` / `fetch()` surface for both protocols
- Per-API cache invalidation with `pathKey()`

## Setup

```bash
npm install magia-api @tanstack/react-query
```

Add the Vite plugin to your `vite.config.ts`:

```typescript
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [magiaApi()],
});
```

## Files

- `magia.config.ts` — Two APIs: REST (Petstore) + GraphQL (GitHub)
- `src/graphql/operations.graphql` — GraphQL operation documents
- `src/lib/magia.ts` — Single client with per-API base URLs and auth
- `src/App.tsx` — Dashboard consuming both APIs with TanStack Query
