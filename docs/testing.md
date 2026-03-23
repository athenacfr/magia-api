# Testing

magia-api ships testing utilities via `magia-api/test`.

## `createTestMagia`

Create a fully mocked magia client. No network calls.

```typescript
import { createTestMagia } from "magia-api/test";

const magia = createTestMagia({
  petstore: {
    getPetById: { data: { id: 1, name: "Rex" } },
    createPet: { data: { id: 2, name: "Buddy" } },
    deletePet: { error: { status: 404, data: { message: "not found" } } },
  },
});
```

### Static responses

```typescript
getPetById: { data: { id: 1, name: "Rex" } }
```

Returns the data directly on `.fetch()`.

### Error responses

```typescript
deletePet: { error: { status: 404, data: { message: "not found" } } }
```

Throws a `MagiaError` with the given status and data.

### Dynamic responses

```typescript
getPetById: (input) => {
  if (input.petId === 999) throw new MagiaError("not found", {
    status: 404, code: "404", api: "petstore", operation: "getPetById", data: null,
  });
  return { id: input.petId, name: "Rex" };
}
```

Function receives the input and returns the response (or throws).

### TanStack Query support

The test client supports all TQ methods:

```typescript
const magia = createTestMagia({
  petstore: {
    getPetById: { data: { id: 1, name: "Rex" } },
  },
});

// queryOptions
const opts = magia.petstore.getPetById.queryOptions({ petId: 1 });
expect(opts.queryKey).toEqual(["magia", "petstore", "getPetById", { petId: 1 }]);

const result = await opts.queryFn();
expect(result).toEqual({ id: 1, name: "Rex" });

// queryKey
magia.petstore.getPetById.queryKey({ petId: 1 });
// → ["magia", "petstore", "getPetById", { petId: 1 }]

// mutationOptions
const mutOpts = magia.petstore.createPet.mutationOptions();
expect(mutOpts.mutationKey).toEqual(["magia", "petstore", "createPet"]);

// mutationKey
magia.petstore.createPet.mutationKey();
// → ["magia", "petstore", "createPet"]

// pathKey
magia.petstore.pathKey();
// → ["magia", "petstore"]
```

### isError

```typescript
try {
  await magia.petstore.deletePet.fetch({ petId: 1 });
} catch (err) {
  expect(magia.petstore.deletePet.isError(err, 404)).toBe(true);
}
```

### Missing mock error

If you call an operation without a mock defined, it throws a descriptive error:

```
No mock defined for petstore.getPetById.
Add it to createTestMagia({ petstore: { getPetById: { data: ... } } })
```

## Testing with Vitest

```typescript
import { describe, it, expect } from "vitest";
import { createTestMagia } from "magia-api/test";

describe("PetDetail", () => {
  const magia = createTestMagia({
    petstore: {
      getPetById: { data: { id: 1, name: "Rex", status: "available" } },
    },
  });

  it("fetches pet by ID", async () => {
    const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
    expect(pet.name).toBe("Rex");
  });
});
```

## Testing with React Testing Library

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTestMagia } from "magia-api/test";

const magia = createTestMagia({
  petstore: {
    getPetById: { data: { id: 1, name: "Rex" } },
  },
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

it("useQuery with magia test client", async () => {
  const { result } = renderHook(
    () => useQuery(magia.petstore.getPetById.queryOptions({ petId: 1 })),
    { wrapper: createWrapper() },
  );

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.name).toBe("Rex");
});
```
