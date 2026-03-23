# Error Handling

magia-api provides `MagiaError` — a unified error class for all API failures.

## MagiaError

```typescript
import { MagiaError } from "magia-api";

try {
  await magia.petstore.getPetById.fetch({ petId: 999 });
} catch (err) {
  if (err instanceof MagiaError) {
    err.status;    // HTTP status code (0 for network/abort/timeout)
    err.code;      // "404", "NETWORK_ERROR", "TIMEOUT", "ABORTED", "GRAPHQL_ERROR"
    err.api;       // API name ("petstore")
    err.operation; // Operation name ("getPetById")
    err.data;      // Error response body (parsed JSON)
    err.response;  // Raw Response object (undefined for network errors)
  }
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `number` | HTTP status code. `0` for network/timeout/abort errors. |
| `code` | `string` | Status as string (`"404"`), or `"NETWORK_ERROR"` / `"TIMEOUT"` / `"ABORTED"` / `"GRAPHQL_ERROR"`. |
| `api` | `string` | API name from config. |
| `operation` | `string` | Operation name. |
| `data` | `unknown` | Parsed error response body. GraphQL errors: array of error objects. |
| `response` | `Response \| undefined` | Raw Response object. `undefined` for network/timeout errors. |

### Helper Methods

```typescript
err.isNotFound();       // status === 404
err.isAuthError();      // status === 401 || 403
err.isValidationError() // status === 400 || 422
err.isServerError();    // status >= 500
err.isNetworkError();   // code === "NETWORK_ERROR"
err.isTimeout();        // code === "TIMEOUT"
err.isAborted();        // code === "ABORTED"
```

## Safe Fetch (no throw)

Returns `{ data, error }` instead of throwing:

```typescript
const { data, error } = await magia.petstore.getPetById.safeFetch({ petId: 999 });

if (error) {
  // error is MagiaError, data is undefined
  if (error.isNotFound()) {
    showNotFound();
  }
} else {
  // data is Pet, error is undefined
  renderPet(data);
}
```

`onError` and `transformError` still fire — only the throw is suppressed.

## Typed Error Guards

Use `.isError()` on operations for typed error narrowing:

```typescript
try {
  await magia.petstore.getPetById.fetch({ petId: 999 });
} catch (err) {
  if (magia.petstore.getPetById.isError(err, 404)) {
    // err is typed as MagiaError with status 404
    console.log("Pet not found:", err.data);
  }
}
```

## Global Error Handler

Handle all errors in one place:

```typescript
const magia = createMagia({
  manifest,
  apis: { /* ... */ },
  onError: (error) => {
    Sentry.captureException(error);
    if (error.isAuthError()) {
      authService.signOut();
    }
  },
});
```

The `onError` handler is called before the error is thrown, so the caller can still catch it.

## Error Transform

Transform errors before `onError` and throwing:

```typescript
const magia = createMagia({
  manifest,
  apis: { /* ... */ },
  transformError: (error) => {
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

## Network, Timeout, and Abort Errors

Network failures and aborted requests are wrapped in `MagiaError` with `status: 0`:

```typescript
// Network error
err.code === "NETWORK_ERROR";
err.isNetworkError(); // true

// Internal timeout (ofetch timeout)
err.code === "TIMEOUT";
err.isTimeout(); // true

// User-initiated abort (via AbortController signal)
err.code === "ABORTED";
err.isAborted(); // true
```
