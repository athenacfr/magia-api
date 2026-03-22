# Spike Tasks

**Spec**: `.specs/features/spike/spec.md`
**Status**: Draft

---

## Execution Plan

### Phase 1: Foundation (Sequential)

```
T1 → T2 → T3
```

### Phase 2: Core Runtime (Sequential — each builds on previous)

```
T3 → T4 → T5
```

### Phase 3: Plugin + Types (Parallel OK)

```
     ┌→ T6 ─┐
T5 ──┤      ├──→ T8
     └→ T7 ─┘
```

### Phase 4: Validation

```
T8
```

---

## Task Breakdown

### T1: Package scaffold

**What**: Initialize pnpm project, TypeScript config, tsup build config, package.json with entry points
**Where**: `package.json`, `tsconfig.json`, `tsup.config.ts`
**Depends on**: None
**Requirement**: SPIKE-01

**Done when**:
- [ ] `pnpm install` succeeds
- [ ] `pnpm build` compiles with tsup
- [ ] package.json has `exports` for `magia-api`, `magia-api/vite`, `magia-api/cli`, `magia-api/test`
- [ ] TypeScript strict mode enabled

**Commit**: `build(spike): scaffold package with tsup and entry points`

---

### T2: Core types

**What**: Define and export all base type interfaces that ship with the package
**Where**: `src/types.ts`
**Depends on**: T1
**Requirement**: SPIKE-02

Types to define:
- `MagiaOperation<TInput, TOutput, TErrors>`
- `MagiaMutation<TInput, TOutput, TErrors>`
- `MagiaFetchOptions`
- `MagiaRawResponse<T>`
- `MagiaTanStackQuery<TInput, TOutput>`
- `MagiaTanStackMutation<TInput, TOutput>`
- `MagiaTanStackInfiniteQuery<TInput, TOutput>`
- `MagiaClient` (empty interface for augmentation)
- `MagiaConfig` (createMagia config shape)
- `ManifestEntry` (internal manifest shape)

**Done when**:
- [ ] All types exported from `src/types.ts`
- [ ] Re-exported from `src/index.ts`
- [ ] `pnpm build` succeeds
- [ ] No TypeScript errors

**Commit**: `feat(spike): add core type definitions`

---

### T3: Hand-crafted petstore manifest

**What**: Create a manifest object with 6 petstore operations: method, path template, param locations
**Where**: `src/manifest.ts` (for spike — will become generated later)
**Depends on**: T2
**Requirement**: SPIKE-03

Operations:
| Operation | Method | Path | Params |
|-----------|--------|------|--------|
| getPetById | GET | /pet/{petId} | petId: path |
| listPets | GET | /pet/findByStatus | status: query |
| createPet | POST | /pet | body: body |
| updatePet | PUT | /pet | body: body |
| deletePet | DELETE | /pet/{petId} | petId: path |
| findPetsByStatus | GET | /pet/findByStatus | status: query |

Each entry: `{ method, path, params: { [name]: 'path' | 'query' | 'body' } }`

**Done when**:
- [ ] Manifest object exported with correct shape
- [ ] Each operation has method, path, params
- [ ] Typed with `ManifestEntry` from T2
- [ ] `pnpm build` succeeds

**Commit**: `feat(spike): add hand-crafted petstore manifest`

---

### T4: Recursive Proxy (`createMagia`)

**What**: Implement `createMagia()` that returns a recursive Proxy accumulating path segments, dispatching `.fetch()` via `@hey-api/client-fetch`
**Where**: `src/proxy.ts`
**Depends on**: T3
**Requirement**: SPIKE-04

Behavior:
- `magia.petstore` → accumulates `['petstore']`
- `magia.petstore.getPetById` → accumulates `['petstore', 'getPetById']`
- `magia.petstore.getPetById.fetch({petId: 1})` → looks up manifest, splits params, calls hey-api client
- Flat params → auto-split: path params into URL template, query params into `?`, body as request body

**Done when**:
- [ ] `createMagia()` exported from `src/index.ts`
- [ ] Proxy accumulates path correctly
- [ ] `.fetch()` dispatches to `@hey-api/client-fetch` with correct URL, method, params
- [ ] Path template substitution works (`/pet/{petId}` → `/pet/1`)
- [ ] Query params appended correctly
- [ ] Body sent for POST/PUT
- [ ] `pnpm build` succeeds

**Commit**: `feat(spike): implement recursive Proxy with createMagia`

---

### T5: Unit tests for Proxy + param mapping

**What**: Vitest tests proving Proxy dispatch, param splitting, URL construction
**Where**: `src/__tests__/proxy.test.ts`
**Depends on**: T4
**Requirement**: SPIKE-07

Tests:
- Proxy accumulates path segments correctly
- `.fetch()` builds correct URL from path template + path params
- Query params mapped correctly
- Body passed for mutations
- Missing manifest entry throws clear error
- Optional input works for no-required-param operations

**Done when**:
- [ ] All tests pass: `pnpm test`
- [ ] Covers param mapping for path, query, body
- [ ] Covers error case (unknown operation)

**Commit**: `test(spike): add proxy and param mapping tests`

---

### T6: tanstackQuery plugin [P]

**What**: Implement `tanstackQuery()` that adds `.queryOptions()`, `.queryKey()`, `.mutationOptions()`, `.mutationKey()` to operations
**Where**: `src/plugins/tanstack-query.ts`
**Depends on**: T5
**Requirement**: SPIKE-05

Behavior:
- `tanstackQuery()` returns a plugin that the Proxy applies
- `.queryOptions({ petId: 1 })` → `{ queryKey: ['magia', 'petstore', 'getPetById', { petId: 1 }], queryFn: () => fetch(...) }`
- `.queryKey({ petId: 1 })` → `['magia', 'petstore', 'getPetById', { petId: 1 }]`
- `.queryKey()` → `['magia', 'petstore', 'getPetById']`
- `.mutationOptions()` → `{ mutationFn: (input) => fetch(...), mutationKey: [...] }`
- `.pathKey()` on API namespace → `['magia', 'petstore']`

**Done when**:
- [ ] Plugin exported from `src/index.ts`
- [ ] queryOptions returns correct shape
- [ ] queryKey is hierarchical
- [ ] mutationOptions wraps fetch correctly
- [ ] pathKey on API namespace works
- [ ] `pnpm build` succeeds

**Commit**: `feat(spike): implement tanstackQuery plugin`

---

### T7: Hand-crafted `.d.ts` type augmentation [P]

**What**: Write a sample `magia-api.d.ts` that augments `MagiaClient` with petstore operations, proving the type augmentation approach
**Where**: `examples/magia-api.d.ts`
**Depends on**: T5
**Requirement**: SPIKE-06

This is what codegen will generate later. For now, hand-write it to prove IntelliSense works.

**Done when**:
- [ ] `declare module 'magia-api'` augments `MagiaClient`
- [ ] Petstore operations are fully typed (params + return types)
- [ ] tanstackQuery types intersected on relevant operations
- [ ] IntelliSense works when referenced in a test file

**Commit**: `feat(spike): add hand-crafted type augmentation example`

---

### T8: Integration test — full flow

**What**: End-to-end test: createMagia → proxy → fetch with mocked HTTP, proving the full DX chain
**Where**: `src/__tests__/integration.test.ts`
**Depends on**: T6, T7
**Requirement**: SPIKE-07

Test:
- Create magia client with petstore config
- Call `magia.petstore.getPetById.fetch({ petId: 1 })` with mocked HTTP
- Verify correct HTTP request was made (URL, method, headers)
- Call `.queryOptions()` and verify shape
- Call `.queryKey()` and verify hierarchy

**Done when**:
- [ ] Full flow test passes: `pnpm test`
- [ ] HTTP requests verified (msw or manual mock)
- [ ] queryOptions shape verified
- [ ] queryKey hierarchy verified

**Commit**: `test(spike): add integration test for full DX flow`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 → T2 → T3

Phase 2 (Sequential):
  T3 → T4 → T5

Phase 3 (Parallel):
  T5 complete, then:
    ├── T6 [P] tanstackQuery
    └── T7 [P] .d.ts

Phase 4 (Sequential):
  T6, T7 complete, then:
    T8
```

## Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: Package scaffold | config files | OK |
| T2: Core types | 1 file | OK |
| T3: Manifest | 1 file | OK |
| T4: Proxy | 1 file + index export | OK |
| T5: Proxy tests | 1 test file | OK |
| T6: TQ plugin | 1 file + export | OK |
| T7: .d.ts example | 1 file | OK |
| T8: Integration test | 1 test file | OK |
