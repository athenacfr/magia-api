# Spike: DX Validation with Petstore

**Decision**: D-050
**Status**: In Progress
**Scope**: Large (multi-file, package scaffold + runtime core)

## Goal

Validate that `magia.<api>.<operation>.fetch()` DX works before investing in the codegen pipeline. Hard-code everything — manifest, types, proxy — using the Petstore OpenAPI spec as the reference.

## Requirements

### SPIKE-01: Package scaffold
A working `magia-api` npm package with TypeScript, tsup build, and correct entry points (`magia-api`, `magia-api/vite`, `magia-api/cli`, `magia-api/test`).

### SPIKE-02: Core types
Ship base types: `MagiaOperation`, `MagiaMutation`, `MagiaFetchOptions`, `MagiaRawResponse`, `MagiaTanStackQuery`, `MagiaTanStackMutation`, `MagiaTanStackInfiniteQuery`, `MagiaClient` interface (empty, augmented by .d.ts).

### SPIKE-03: Hand-crafted manifest
A manifest object describing 5-6 petstore operations (getPetById, listPets, createPet, updatePet, deletePet, findPetsByStatus) with method, path template, param locations (path/query/body).

### SPIKE-04: Recursive Proxy (`createMagia`)
tRPC v11-style recursive Proxy that accumulates path segments and dispatches `.fetch()` via `@hey-api/client-fetch`. Flat params auto-mapped from manifest metadata.

### SPIKE-05: tanstackQuery plugin
`tanstackQuery()` function that extends operations with `.queryOptions()`, `.queryKey()`, `.mutationOptions()`, `.mutationKey()`. Option factories pattern — returns standard TanStack Query options objects.

### SPIKE-06: Hand-crafted `.d.ts`
A hand-written `magia-api.d.ts` type augmentation for petstore that proves the `declare module 'magia-api'` approach works with full IntelliSense.

### SPIKE-07: Tests
Unit tests proving: Proxy dispatches correctly, params split correctly, queryOptions returns correct shape, queryKey is hierarchical.

## Out of Scope
- Codegen (Hey API, graphql-codegen)
- Vite plugin / virtual module
- Schema resolution
- CLI
- SSE / subscriptions
- Error handling (MagiaError)
- File uploads
- GraphQL anything
- Data transformers
