# GraphQL Example

GitHub GraphQL API with TanStack Query integration.

## What this shows

- GraphQL schema + operation documents
- Typed queries and mutations
- TanStack Query hooks (`queryOptions`, `mutationOptions`)
- Auth token injection via `fetchOptions.headers`

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

- `magia.config.ts` — Points to the GitHub GraphQL schema and local `.graphql` documents
- `src/graphql/operations.graphql` — Query and mutation definitions
- `src/lib/magia.ts` — Runtime client with auth headers
- `src/App.tsx` — React component using TanStack Query hooks
