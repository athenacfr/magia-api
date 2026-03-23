# Guide: Multiple APIs

magia-api supports multiple APIs in a single config — each independently typed.

## Config

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
    payments: {
      type: "rest",
      schema: "./schemas/payments.yaml",
    },
    github: {
      type: "graphql",
      schema: "./schemas/github.graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
```

## Runtime

```typescript
import { createMagia } from "magia-api";
import { manifest } from "./magia.gen";

export const magia = createMagia(
  {
    apis: {
      petstore: { baseUrl: import.meta.env.VITE_PETSTORE_URL },
      payments: { baseUrl: import.meta.env.VITE_PAYMENTS_URL },
      github: {
        baseUrl: "https://api.github.com/graphql",
        fetchOptions: {
          headers: () => ({ Authorization: `Bearer ${getToken()}` }),
        },
      },
    },
  },
  manifest,
);
```

## Usage

Each API is a separate namespace:

```typescript
// REST
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
const invoice = await magia.payments.getInvoice.fetch({ id: "inv_123" });

// GraphQL
const user = await magia.github.getUser.fetch({ login: "octocat" });

// Cache invalidation per API
queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });
queryClient.invalidateQueries({ queryKey: magia.github.pathKey() });
```

## Selective Generation

Generate only specific APIs:

```bash
magia-api generate petstore     # Only petstore
magia-api generate petstore github  # petstore + github
```

Incremental builds automatically skip unchanged APIs.
