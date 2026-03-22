# F-013: Error Handling

## Problem

Today, error handling across REST and GraphQL is fragmented:
- REST errors come as HTTP status codes with varying body shapes
- GraphQL errors come as `{ errors: [...] }` in the response body (status 200)
- Developers write different error handling logic per API, per protocol
- No typed errors — you `catch(e: unknown)` and hope for the best
- inspira-app had to build a custom `ApplicationError` class to unify this

## Goal

Unified, typed error handling across REST and GraphQL. Every `.fetch()` call produces errors that:
1. Are typed from the schema (OpenAPI error responses, GraphQL error extensions)
2. Have a consistent shape regardless of protocol
3. Are easy to discriminate (network vs validation vs auth vs not-found)
4. Work naturally with TanStack Query's error handling

## Design

### MagiaError — unified error class

```typescript
class MagiaError extends Error {
  /** HTTP status code (REST) or inferred code (GraphQL) */
  status: number

  /** Error code string — from schema or inferred */
  code: string

  /** Which API this error came from */
  api: string

  /** Which operation this error came from */
  operation: string

  /** Typed error data — from OpenAPI error response schema or GraphQL extensions */
  data: unknown  // narrowed per operation in .d.ts

  /** Original response (for advanced use) */
  response: Response

  /** Discrimination helpers */
  isNetworkError(): boolean     // fetch failed entirely (offline, DNS, CORS)
  isValidationError(): boolean  // 400/422 — bad input
  isAuthError(): boolean        // 401/403
  isNotFound(): boolean         // 404
  isServerError(): boolean      // 5xx
  isTimeout(): boolean          // AbortSignal timeout or request timeout
}
```

### How errors are produced

**REST (from OpenAPI error responses):**
```yaml
# OpenAPI spec
paths:
  /pet/{petId}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Pet' }
        '404':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/NotFoundError' }
        '422':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ValidationError' }
```

The Proxy catches non-2xx responses and throws `MagiaError` with:
- `status` from HTTP response
- `code` inferred from status or error body
- `data` parsed from response body, typed from schema

**GraphQL (from error response):**
```json
{
  "data": null,
  "errors": [
    {
      "message": "User not found",
      "extensions": { "code": "NOT_FOUND", "status": 404 }
    }
  ]
}
```

The Proxy detects `errors` array in GraphQL response and throws `MagiaError` with:
- `status` from `extensions.status` or inferred (200 if no extension)
- `code` from `extensions.code` or `"GRAPHQL_ERROR"`
- `data` from error extensions
- `message` from first error message

### Typed errors per operation

The `.d.ts` augmentation narrows error types per operation:

```typescript
// Generated: src/magia-api.d.ts
declare module 'magia-api' {
  interface MagiaClient {
    petstore: {
      getPetById: MagiaOperation<GetPetByIdParams, Pet, {
        404: NotFoundError
        422: ValidationError
      }>
    }
    github: {
      getUser: MagiaOperation<GetUserVariables, GetUserQuery, {
        NOT_FOUND: { message: string }
      }>
    }
  }
}

// Updated base type
interface MagiaOperation<TInput, TOutput, TErrors = {}> {
  fetch(input: TInput, opts?: MagiaFetchOptions): Promise<TOutput>
  // Type-safe error checking
  isError<TCode extends keyof TErrors>(
    error: unknown,
    code: TCode
  ): error is MagiaError & { status: TCode; data: TErrors[TCode] }
}
```

### Usage — catching errors

**Basic catch:**
```typescript
try {
  const pet = await magia.petstore.getPetById.fetch({ petId: 1 })
} catch (error) {
  if (error instanceof MagiaError) {
    console.log(error.status)    // number
    console.log(error.code)      // string
    console.log(error.api)       // "petstore"
    console.log(error.operation) // "getPetById"

    // Discrimination helpers
    if (error.isNotFound()) {
      // handle 404
    }
    if (error.isValidationError()) {
      // handle 400/422
    }
    if (error.isAuthError()) {
      // handle 401/403 — redirect to login
    }
  }
}
```

**Type-safe error narrowing:**
```typescript
try {
  const pet = await magia.petstore.getPetById.fetch({ petId: 1 })
} catch (error) {
  // Narrows error.data to NotFoundError type
  if (magia.petstore.getPetById.isError(error, 404)) {
    error.data  // typed as NotFoundError
    error.data.message  // autocomplete works
  }
  // Narrows to ValidationError
  if (magia.petstore.getPetById.isError(error, 422)) {
    error.data  // typed as ValidationError
    error.data.fields  // autocomplete works
  }
}
```

**With TanStack Query:**
```typescript
const { data, error } = useQuery(
  magia.petstore.getPetById.queryOptions({ petId: 1 })
)

// error is MagiaError | null
if (error?.isNotFound()) {
  return <NotFound />
}
if (error?.isAuthError()) {
  return <Redirect to="/login" />
}
```

### Global error handling

Users can add global error interceptors in `createMagia()`:

```typescript
export const magia = createMagia({
  // Global error handler — runs on every MagiaError
  onError: (error) => {
    // Log to monitoring
    Sentry.captureException(error)

    // Global auth handling
    if (error.isAuthError()) {
      authService.signOut()
    }
  },
  apis: {
    petstore: {
      baseUrl: import.meta.env.VITE_PETSTORE_URL,
      // Per-API error handler (runs after global)
      onError: (error) => {
        // petstore-specific error handling
      },
    },
  },
})
```

### Error transformation

Users can transform errors before they're thrown:

```typescript
export const magia = createMagia({
  // Transform MagiaError into app-specific error
  transformError: (error) => {
    // Return a custom error class
    return new ApplicationError({
      code: mapToAppCode(error.code),
      title: i18n.t(`errors.${error.code}.title`),
      message: i18n.t(`errors.${error.code}.message`),
      contactSupport: error.isServerError(),
    })
  },
})
```

### Network errors

Fetch failures (offline, DNS, CORS, timeout) are wrapped in `MagiaError` too:

```typescript
try {
  await magia.petstore.getPetById.fetch({ petId: 1 })
} catch (error) {
  if (error instanceof MagiaError) {
    if (error.isNetworkError()) {
      // No response — network issue
      error.status  // 0
      error.code    // "NETWORK_ERROR"
    }
    if (error.isTimeout()) {
      error.code    // "TIMEOUT"
    }
  }
}
```

### GraphQL partial errors

GraphQL can return both `data` and `errors`. By default, magia throws if `errors` is non-empty. But for partial data scenarios:

```typescript
// Opt-in to partial data (don't throw on GraphQL errors)
const result = await magia.github.getUser.fetch(
  { login: 'octocat' },
  { throwOnGraphQLError: false }
)
// result: { data: GetUserQuery | null, errors: MagiaError[] }
```

## What gets generated

From the OpenAPI spec / GraphQL schema, magia generates:

1. **Error type definitions** in `node_modules/.magia/internals/<api>/errors.d.ts`
2. **Error mapping** in `manifest.ts` — which status codes / error codes map to which types
3. **`.isError()` type guards** in `src/magia-api.d.ts` per operation
4. **`MagiaError` class** shipped with the `magia-api` package (not generated)

## Priority

This feature spans multiple areas:
- F-003 (codegen engine) extracts error types from specs
- F-005 (runtime client) wraps responses in MagiaError
- F-006 (type generation) adds error types + `.isError()` to `.d.ts`

Should be implemented alongside F-003/F-005/F-006, not as a separate phase.
