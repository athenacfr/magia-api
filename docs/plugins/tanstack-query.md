# TanStack Query Plugin

The `tanstackQuery()` plugin adds query/mutation options to your operations, giving you first-class TanStack Query integration without wrapper hooks.

## Setup

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
  },
});
```

No `<MagiaProvider>` needed — use standard `<QueryClientProvider>`.

## API

### `.queryOptions(input, opts?)`

Returns options for `useQuery()` / `useSuspenseQuery()`:

```typescript
import { useQuery } from "@tanstack/react-query";

const { data } = useQuery(magia.petstore.getPetById.queryOptions({ petId: 1 }));

// Override inline
const { data } = useQuery({
  ...magia.petstore.getPetById.queryOptions({ petId: 1 }),
  staleTime: 30_000,
  enabled: !!petId,
});
```

### `.queryKey(input?)`

Returns the query key for cache operations:

```typescript
// Specific query key
magia.petstore.getPetById.queryKey({ petId: 1 });
// → ["magia", "petstore", "getPetById", { petId: 1 }]

// Without input (matches all calls to this operation)
magia.petstore.getPetById.queryKey();
// → ["magia", "petstore", "getPetById"]
```

### `.mutationOptions(opts?)`

Returns options for `useMutation()`:

```typescript
import { useMutation } from "@tanstack/react-query";

const { mutate } = useMutation(magia.petstore.createPet.mutationOptions());

// With callbacks
const { mutate } = useMutation(
  magia.petstore.createPet.mutationOptions({
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });
    },
  }),
);
```

### `.mutationKey()`

Returns the mutation key:

```typescript
magia.petstore.createPet.mutationKey();
// → ["magia", "petstore", "createPet"]
```

### `.pathKey()`

Returns the API-level key for broad cache invalidation:

```typescript
// Invalidate all petstore queries
queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });
// → ["magia", "petstore"]
```

## Query Key Structure

All keys follow a hierarchical pattern:

```
["magia", "<api>", "<operation>", input?]
```

This enables partial matching:

```typescript
// Invalidate everything
queryClient.invalidateQueries({ queryKey: ["magia"] });

// Invalidate all petstore queries
queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });

// Invalidate specific operation
queryClient.invalidateQueries({ queryKey: magia.petstore.getPetById.queryKey() });

// Invalidate specific input
queryClient.invalidateQueries({
  queryKey: magia.petstore.getPetById.queryKey({ petId: 1 }),
});
```
