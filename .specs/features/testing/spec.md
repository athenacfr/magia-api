# Testing Strategy

## Overview

Three layers of testing for developing magia-api itself, plus testing utilities shipped to users.

## Layer 1: Unit Tests (native, fast)

Individual functions in isolation. Run with `pnpm test`.

```
test/unit/
├── schema-resolver.test.ts     # URL vs file vs async fn vs script detection + resolution
├── manifest-generator.test.ts  # OpenAPI/GraphQL spec → manifest entries
├── proxy.test.ts               # Recursive Proxy path accumulation + dispatch
├── param-mapper.test.ts        # Flat params → path/query/body splitting from manifest
├── query-keys.test.ts          # Hierarchical key factory
├── error-handler.test.ts       # MagiaError construction, discrimination helpers
├── dts-generator.test.ts       # .d.ts augmentation output
├── transformer.test.ts         # Data transformer generation from format fields
└── types.test-d.ts             # Type-level tests (vitest expectTypeOf)
```

## Layer 2: Integration Tests (native, medium)

Full pipeline: config → schema → codegen → manifest → .d.ts. Run with `pnpm test`.

```
test/integration/
├── rest-codegen.test.ts        # OpenAPI spec → manifest + .d.ts
├── graphql-codegen.test.ts     # GraphQL schema + documents → manifest + .d.ts
├── tanstack-plugin.test.ts     # TQ option factories generated correctly
├── sse-detection.test.ts       # SSE endpoints auto-detected from spec
├── upload-detection.test.ts    # multipart/form-data auto-detected
├── pagination-detection.test.ts # Paginated endpoints → infiniteQueryOptions
└── error-types.test.ts         # Error schemas extracted from spec
```

**Snapshot testing for codegen output:**
```typescript
test('petstore spec generates correct manifest', async () => {
  const manifest = await generateManifest('./fixtures/petstore.yaml')
  expect(manifest).toMatchSnapshot()
})

test('petstore spec generates correct .d.ts', async () => {
  const dts = await generateDts('./fixtures/petstore.yaml', { plugins: [tanstackQuery()] })
  expect(dts).toMatchSnapshot()
})
```

## Layer 3: E2E Tests (Docker, isolated)

Each E2E "state" is a real Vite project in its own Docker container. Clean machine, no pollution between tests.

### E2E States

| State | Scenario | Validates |
|-------|----------|-----------|
| `rest-basic` | Single REST API, fetch only | Core pipeline: config → schema → manifest → .d.ts → .fetch() |
| `graphql-basic` | Single GraphQL API, fetch only | GraphQL pipeline: schema + documents → manifest → .fetch() |
| `multi-api` | REST + GraphQL together | Unified config, both protocols, same DX |
| `tanstack-query` | REST + GraphQL with TQ plugin | queryOptions, queryKey, mutationOptions, infiniteQueryOptions |
| `sse-streaming` | REST with SSE endpoints | .subscribe(), auto-reconnect, typed events |
| `graphql-subscriptions` | GraphQL subscriptions via SSE | .subscribe() for GraphQL |
| `file-upload` | REST with multipart/form-data | File/Blob input, auto FormData construction |
| `error-handling` | Various error scenarios | MagiaError, isError narrowing, 404/422/500, network errors |
| `schema-watch` | Local schema changes trigger regen | Vite plugin watches, regenerates, HMR picks up new types |
| `ci-pipeline` | Clean install → generate → tsc → build | Full CI simulation from scratch |

### Directory structure

```
test/
├── fixtures/
│   ├── petstore.yaml               # OpenAPI spec (Petstore)
│   ├── petstore-with-sse.yaml      # OpenAPI with SSE endpoints
│   ├── petstore-with-uploads.yaml  # OpenAPI with file upload endpoints
│   ├── github.graphql              # GraphQL schema
│   └── operations/                 # .graphql document files
│       ├── getUser.graphql
│       └── onIssueCreated.graphql
├── unit/
├── integration/
├── e2e/
│   ├── docker-compose.yml
│   ├── Dockerfile.base
│   ├── helpers/
│   │   ├── mock-server.ts          # Shared MSW server (REST + GraphQL + SSE)
│   │   └── assertions.ts           # Shared test helpers
│   └── states/
│       ├── rest-basic/
│       │   ├── fixtures/
│       │   ├── project/            # Real Vite project (package.json, config, src/)
│       │   └── tests/
│       ├── graphql-basic/
│       ├── multi-api/
│       ├── tanstack-query/
│       ├── sse-streaming/
│       ├── graphql-subscriptions/
│       ├── file-upload/
│       ├── error-handling/
│       ├── schema-watch/
│       └── ci-pipeline/
```

### Docker setup

**Dockerfile.base:**
```dockerfile
FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npx playwright install chromium --with-deps
WORKDIR /app
```

**docker-compose.yml:**
```yaml
services:
  rest-basic:
    build:
      context: .
      dockerfile: Dockerfile.base
    volumes:
      - ../../:/magia-api:ro
      - ./states/rest-basic:/app/state
      - ./helpers:/app/helpers
    command: pnpm vitest run --config /app/state/vitest.config.ts

  graphql-basic:
    build:
      context: .
      dockerfile: Dockerfile.base
    volumes:
      - ../../:/magia-api:ro
      - ./states/graphql-basic:/app/state
      - ./helpers:/app/helpers
    command: pnpm vitest run --config /app/state/vitest.config.ts

  multi-api:
    build:
      context: .
      dockerfile: Dockerfile.base
    volumes:
      - ../../:/magia-api:ro
      - ./states/multi-api:/app/state
      - ./helpers:/app/helpers
    command: pnpm vitest run --config /app/state/vitest.config.ts

  # ... one service per state (all run in parallel)
```

Each state container:
1. Starts from clean Node base image
2. Mounts magia-api source as read-only
3. Has its own project/ with real Vite project files
4. Installs dependencies (magia-api from local mount + real deps)
5. Runs its tests
6. Exits with pass/fail code

### Mock server (shared across states)

```typescript
// test/e2e/helpers/mock-server.ts
import { setupServer } from 'msw/node'
import { http, graphql } from 'msw'

export const server = setupServer(
  // REST
  http.get('http://localhost:9999/pet/:petId', ({ params }) => {
    return Response.json({ id: Number(params.petId), name: 'Rex' })
  }),
  http.post('http://localhost:9999/pet', async ({ request }) => {
    const body = await request.json()
    return Response.json({ id: 42, ...body })
  }),
  http.post('http://localhost:9999/pet/:petId/image', async ({ request }) => {
    const formData = await request.formData()
    return Response.json({ uploaded: true, filename: formData.get('file')?.name })
  }),

  // GraphQL
  graphql.query('GetUser', ({ variables }) => {
    return Response.json({
      data: { user: { login: variables.login, name: 'Octocat' } }
    })
  }),

  // SSE
  http.get('http://localhost:9999/events/:id', ({ params }) => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"update","id":1}\n\n'))
        controller.enqueue(encoder.encode('data: {"type":"update","id":2}\n\n'))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }),

  // Errors
  http.get('http://localhost:9999/pet/999', () => {
    return Response.json({ message: 'Not found', code: 'NOT_FOUND' }, { status: 404 })
  }),
)
```

### Type tests

```typescript
// test/unit/types.test-d.ts
import { expectTypeOf, test } from 'vitest'

test('fetch returns correct type', () => {
  expectTypeOf(magia.petstore.getPetById.fetch({ petId: 1 }))
    .toEqualTypeOf<Promise<Pet>>()
})

test('queryOptions returns UseQueryOptions', () => {
  expectTypeOf(magia.petstore.getPetById.queryOptions({ petId: 1 }))
    .toMatchTypeOf<UseQueryOptions<Pet>>()
})

test('subscribe returns AsyncIterable', () => {
  expectTypeOf(magia.petstore.watchPetUpdates.subscribe({ petId: 1 }))
    .toEqualTypeOf<AsyncIterable<PetUpdateEvent>>()
})

test('isError narrows type', () => {
  const error = {} as unknown
  if (magia.petstore.getPetById.isError(error, 404)) {
    expectTypeOf(error.data).toEqualTypeOf<NotFoundError>()
  }
})
```

## Running tests

| Command | What | Where | Speed |
|---------|------|-------|-------|
| `pnpm test` | Unit + Integration + Type tests | Native | ~2s |
| `pnpm test:e2e` | All E2E states in parallel | Docker | ~2min |
| `pnpm test:e2e -- rest-basic` | Single E2E state | Docker | ~30s |
| `pnpm test:e2e:local` | E2E without Docker (less isolated) | Native | ~1min |

**package.json scripts:**
```json
{
  "test": "vitest",
  "test:e2e": "docker compose -f test/e2e/docker-compose.yml up --build --abort-on-container-exit",
  "test:e2e:local": "vitest run --config test/e2e/vitest.config.ts"
}
```

## CI

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: pnpm install
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test:e2e
```

Unit tests run first (fast gate). E2E only runs if unit passes (avoids wasting Docker build time on broken code).
