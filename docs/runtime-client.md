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
| `onError` | `(error: MagiaError) => void` | Global error handler (fires after `transformError`) |
| `transformError` | `(error: MagiaError) => MagiaError` | Transform errors before `onError` and throwing |

### Per-API Config

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | `string` | Base URL for the API |
| `retry` | `number \| false` | Retry count for failed requests (default: `0`) |
| `timeout` | `number` | Request timeout in milliseconds |
| `onRequest` | `(ctx: MagiaRequestContext) => void \| Promise<void>` | Hook before each request — mutate headers, inject auth |
| `onResponse` | `(ctx: MagiaResponseContext) => void \| Promise<void>` | Hook after each response — logging, data transforms |
| `onResponseError` | `(ctx: MagiaResponseContext) => void \| Promise<void>` | Hook on error responses (4xx/5xx) |
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

### Safe Fetch (no throw)

Returns a discriminated union instead of throwing:

```typescript
const { data, error } = await magia.petstore.getPetById.safeFetch({ petId: 1 });

if (error) {
  // error is MagiaError, data is undefined
  console.error(error.message);
} else {
  // data is Pet, error is undefined
  console.log(data.name);
}
```

### Subscribe (SSE / GraphQL Subscriptions)

Stream real-time events from SSE endpoints or GraphQL subscriptions:

```typescript
// REST SSE (auto-detected from text/event-stream in OpenAPI spec)
for await (const event of magia.ai.streamChat.subscribe({ message: "hello" })) {
  console.log(event); // fully typed
}

// GraphQL subscription
for await (const event of magia.github.onIssueCreated.subscribe({ repo: "my-repo" })) {
  console.log(event);
}

// With AbortSignal
const controller = new AbortController();
for await (const event of magia.ai.streamChat.subscribe(
  { message: "hello" },
  { signal: controller.signal },
)) {
  console.log(event);
}
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

## Interceptors

Interceptors receive a `MagiaRequestContext` or `MagiaResponseContext` with `api`, `operation`, `url`, `method`, and a per-request `context` bag:

```typescript
const magia = createMagia({
  manifest,
  apis: {
    petstore: {
      baseUrl: "/api",
      onRequest(ctx) {
        // ctx.api, ctx.operation, ctx.url, ctx.method, ctx.context
        if (ctx.context.requiresAuth) {
          ctx.headers["Authorization"] = `Bearer ${getToken()}`;
        }
      },
      onResponse(ctx) {
        console.log(`${ctx.api}.${ctx.operation} → ${ctx.status}`);
      },
      onResponseError(ctx) {
        metrics.increment(`api.error.${ctx.status}`);
      },
    },
  },
});

// Pass context per-request
await magia.petstore.getMyPets.fetch({}, { context: { requiresAuth: true } });
```

### Typed Context

Augment `MagiaContext` for type-safe custom context:

```typescript
// src/magia-context.d.ts
declare module "magia-api" {
  interface MagiaContext {
    requiresAuth?: boolean;
    traceId?: string;
  }
}
```

## Error Transform

Transform errors before they reach `onError` or are thrown:

```typescript
const magia = createMagia({
  manifest,
  apis: { /* ... */ },
  transformError: (error) => {
    // Map to app-specific error codes
    return new MagiaError(`App: ${error.message}`, {
      ...error,
      code: mapToAppCode(error.code),
    });
  },
  onError: (error) => {
    // Receives the transformed error
    Sentry.captureException(error);
  },
});
```

## Global Error Handler

```typescript
const magia = createMagia({
  manifest,
  apis: { /* ... */ },
  onError: (error) => {
    // Called for every request error (after transformError)
    Sentry.captureException(error);
  },
});
```

See [Error Handling](error-handling.md) for typed error details.

## Shorthands

Destructure API proxies for cleaner code:

```typescript
const { petstore, users } = magia.shorthands();

// Use directly — fully typed
const pet = await petstore.getPetById.fetch({ petId: 1 });
const { data } = useQuery(petstore.getPetById.queryOptions({ petId: 1 }));
queryClient.invalidateQueries({ queryKey: petstore.pathKey() });
```

Useful when a component only works with one API — avoids repeating `magia.` everywhere.
