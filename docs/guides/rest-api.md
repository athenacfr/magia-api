# Guide: REST API

End-to-end example of setting up a REST API with magia-api.

## 1. Config

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

## 2. Vite Plugin

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { magiaApi } from "magia-api/vite";

export default defineConfig({
  plugins: [react(), magiaApi()],
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
      petstore: {
        baseUrl: "https://petstore3.swagger.io/api/v3",
        fetchOptions: {
          headers: { "api_key": "special-key" },
        },
      },
    },
  },
  manifest,
);
```

## 4. Using in Components

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { magia } from "../lib/magia";

function PetDetail({ petId }: { petId: number }) {
  const { data: pet, isLoading } = useQuery(
    magia.petstore.getPetById.queryOptions({ petId }),
  );

  if (isLoading) return <div>Loading...</div>;
  return <div>{pet.name}</div>;
}

function CreatePet() {
  const queryClient = useQueryClient();

  const { mutate } = useMutation({
    ...magia.petstore.addPet.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: magia.petstore.pathKey() });
    },
  });

  return (
    <button onClick={() => mutate({ name: "Rex", status: "available" })}>
      Add Pet
    </button>
  );
}
```

## 5. Error Handling

```typescript
import { MagiaError } from "magia-api";

try {
  await magia.petstore.getPetById.fetch({ petId: 999 });
} catch (err) {
  if (magia.petstore.getPetById.isError(err, 404)) {
    console.log("Pet not found");
  }
}
```

## 6. Plain Fetch (No TanStack Query)

```typescript
// Works without any plugins
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
const pets = await magia.petstore.findPetsByStatus.fetch({ status: "available" });
```
