# Error Handling

magia-api provides `MagiaError` — a unified error class for all API failures.

## MagiaError

```typescript
import { MagiaError } from "magia-api";

try {
  await magia.petstore.getPetById.fetch({ petId: 999 });
} catch (err) {
  if (err instanceof MagiaError) {
    err.status;    // HTTP status code (0 for network errors)
    err.code;      // Error code string ("404", "NETWORK_ERROR", "TIMEOUT")
    err.api;       // API name ("petstore")
    err.operation; // Operation name ("getPetById")
    err.data;      // Error response body (parsed JSON)
  }
}
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `status` | `number` | HTTP status code. `0` for network/timeout errors. |
| `code` | `string` | Error code. Status as string, or `"NETWORK_ERROR"` / `"TIMEOUT"`. |
| `api` | `string` | API name from config. |
| `operation` | `string` | Operation name. |
| `data` | `unknown` | Parsed error response body. |

### Helper Methods

```typescript
err.isNotFound();     // status === 404
err.isAuthError();    // status === 401
err.isForbidden();    // status === 403
err.isNetworkError(); // code === "NETWORK_ERROR"
err.isTimeout();      // code === "TIMEOUT"
```

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

## Network and Timeout Errors

Network failures and aborted requests are wrapped in `MagiaError` with `status: 0`:

```typescript
// Network error
err.status === 0;
err.code === "NETWORK_ERROR";
err.isNetworkError(); // true

// AbortSignal timeout
err.status === 0;
err.code === "TIMEOUT";
err.isTimeout(); // true
```
