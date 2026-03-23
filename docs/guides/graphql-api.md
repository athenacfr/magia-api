# Guide: GraphQL API

End-to-end example of setting up a GraphQL API with magia-api.

## 1. Write Operations

Create `.graphql` files for your operations:

```graphql
# src/graphql/operations.graphql
query GetUser($login: String!) {
  user(login: $login) {
    name
    avatarUrl
    repositories(first: 5) {
      nodes {
        name
        stargazerCount
      }
    }
  }
}

mutation CreateIssue($input: CreateIssueInput!) {
  createIssue(input: $input) {
    issue {
      id
      title
    }
  }
}
```

## 2. Config

```typescript
// magia.config.ts
import { defineConfig, tanstackQuery } from "magia-api";

export default defineConfig({
  output: "src/magia.gen.ts",
  apis: {
    github: {
      type: "graphql",
      schema: "https://docs.github.com/public/fpt/schema.docs.graphql",
      documents: "./src/graphql/**/*.graphql",
      plugins: [tanstackQuery()],
    },
  },
});
```

## 3. Runtime Client

```typescript
// src/lib/magia.ts
import { createMagia } from "magia-api";
import { manifest } from "../magia.gen";

export const magia = createMagia(
  {
    apis: {
      github: {
        baseUrl: "https://api.github.com/graphql",
        fetchOptions: {
          headers: () => ({
            Authorization: `Bearer ${getToken()}`,
          }),
        },
      },
    },
  },
  manifest,
);
```

## 4. Usage

The API surface is identical to REST:

```typescript
// Plain fetch
const user = await magia.github.getUser.fetch({ login: "octocat" });

// TanStack Query
const { data } = useQuery(magia.github.getUser.queryOptions({ login: "octocat" }));

// Mutations
const { mutate } = useMutation(magia.github.createIssue.mutationOptions());

// Cache invalidation
queryClient.invalidateQueries({ queryKey: magia.github.pathKey() });
```

## How It Works

magia-api uses `@graphql-codegen/core` to:

1. Parse your `.graphql` schema
2. Parse your `.graphql` operation documents
3. Generate TypeScript types for all operations and their variables
4. Create manifest entries with compiled document strings

At runtime, the proxy sends GraphQL POST requests with `{ query, variables }` — no special client needed.
