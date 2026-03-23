# Runtime Client

`createMagia()` creates a typed proxy client from your config.

## Setup

```typescript
// src/lib/magia.ts
import { createMagia } from "magia-api";
import { manifest } from "./magia.gen";

export const magia = createMagia({
  manifest,
  apis: {
    petstore: {
      baseUrl: import.meta.env.VITE_PETSTORE_URL,
      fetchOptions: {
        headers: { "X-Api-Key": import.meta.env.VITE_API_KEY },
      },
    },
  },
});
```

## Config

| Field | Type | Description |
|-------|------|-------------|
| `manifest` | `Manifest` | Generated manifest from `magia.gen.ts` |
| `apis` | `{ [K in keyof Manifest]: MagiaApiConfig }` | Per-API runtime config — keys must match manifest |
| `onError` | `(error: MagiaError) => void` | Global error handler |

### Per-API Config

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Base URL for the API |
| `fetchOptions.headers` | `Record \| () => Record \| () => Promise<Record>` | Static or dynamic headers |

## Usage

### Fetch

```typescript
// Simple fetch
const pet = await magia.petstore.getPetById.fetch({ petId: 1 });

// With AbortSignal
const pet = await magia.petstore.getPetById.fetch(
  { petId: 1 },
  { signal: controller.signal },
);

// With raw response (headers, status)
const { data, headers, status } = await magia.petstore.listPets.fetch(
  { limit: 10 },
  { raw: true },
);

// Explicit query/headers for edge cases
await magia.petstore.createPet.fetch(
  { name: "Rex" },
  { query: { dryRun: true }, headers: { "X-Custom": "value" } },
);
```

### Parameter Mapping

Parameters are flat — magia maps them to path/query/body automatically from the manifest:

```typescript
// User writes:
magia.petstore.getPetById.fetch({ petId: 1, status: "available" });
// Proxy maps: petId → path, status → query
// Result: GET /pet/1?status=available
```

Priority: path > query > body. Use `{ query, headers }` in options for explicit control.

## Dynamic Headers

```typescript
const magia = createMagia({
  manifest,
  apis: {
    protected: {
      baseUrl: "/api",
      fetchOptions: {
        headers: () => ({
          Authorization: `Bearer ${getToken()}`,
        }),
      },
    },
  },
});
```

Headers can be:
- Static object: `{ "X-Api-Key": "abc" }`
- Sync function: `() => ({ Authorization: "Bearer ..." })`
- Async function: `async () => ({ Authorization: await getToken() })`

## Global Error Handler

```typescript
const magia = createMagia({
  manifest,
  apis: { /* ... */ },
  onError: (error) => {
    // Called for every request error
    Sentry.captureException(error);
  },
});
```

See [Error Handling](error-handling.md) for typed error details.
