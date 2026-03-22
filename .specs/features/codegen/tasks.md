# Codegen Engine Tasks (F-003 + F-006)

**Status**: In Progress
**Scope**: Large

## Pipeline

```
Schema text (F-002)
    ↓
Parse (JSON/YAML → OpenAPI object)
    ↓
Extract operations → method, path, params, operationId
    ↓
├── manifest.ts (runtime: operation registry)
├── Hey API → types (TypeScript types from spec schemas)
└── magia-api.d.ts (type augmentation combining both)
```

## Execution Plan

### Phase 1: Parse + Extract (Sequential)

```
T1 → T2
```

### Phase 2: Codegen (Parallel OK)

```
     ┌→ T3 (Hey API types)
T2 ──┤
     └→ T4 (Manifest gen)
```

### Phase 3: Type Augmentation + Orchestration (Sequential)

```
T3, T4 → T5 → T6 → T7
```

---

## Task Breakdown

### T1: OpenAPI spec parser

**What**: Parse OpenAPI 3.x JSON/YAML into a typed object
**Where**: `src/codegen/parser.ts`
**Depends on**: None

Accepts schema text (string), detects JSON vs YAML, returns typed OpenAPI object.
Uses `yaml` package for YAML, native JSON.parse for JSON.

**Done when**:
- [ ] Parses JSON OpenAPI specs
- [ ] Parses YAML OpenAPI specs
- [ ] Detects format automatically
- [ ] Throws clear error on invalid input
- [ ] `pnpm build` succeeds

---

### T2: Operation extractor

**What**: Walk parsed OpenAPI spec and extract operations into ManifestEntry format
**Where**: `src/codegen/extractor.ts`
**Depends on**: T1

For each `paths[path][method]`:
- method (GET/POST/PUT/DELETE/PATCH)
- path template (/pet/{petId})
- operationId (or generate via operationName config fn)
- params with locations (path/query/body) from parameters + requestBody

**Done when**:
- [ ] Extracts all operations from a spec
- [ ] Maps parameters to path/query locations
- [ ] Detects requestBody as body params
- [ ] Uses operationId, falls back to method+path naming
- [ ] Respects custom operationName function from config
- [ ] Tests pass

---

### T3: Hey API type generation [P]

**What**: Call Hey API's createClient to generate TypeScript types from spec
**Where**: `src/codegen/hey-api.ts`
**Depends on**: T2

Calls `createClient` with:
- input = spec path or content
- output = `node_modules/.magia/internals/<apiName>/`
- plugins = `['@hey-api/typescript']` only (no SDK, no client)

**Done when**:
- [ ] Generates types.gen.ts in output dir
- [ ] Works with OpenAPI 3.0 and 3.1 specs
- [ ] `pnpm build` succeeds

---

### T4: Manifest generator [P]

**What**: Generate manifest.ts from extracted operations
**Where**: `src/codegen/manifest-gen.ts`
**Depends on**: T2

Writes `node_modules/.magia/manifest.ts` with the Manifest object
that the runtime proxy consumes.

**Done when**:
- [ ] Generates valid TypeScript manifest
- [ ] Includes plugins from config
- [ ] Each operation has method, path, params
- [ ] Output is importable

---

### T5: .d.ts generator

**What**: Generate magia-api.d.ts type augmentation
**Where**: `src/codegen/dts-gen.ts`
**Depends on**: T3, T4

Generates `declare module 'magia-api'` augmenting MagiaClient with
typed operations. References Hey API generated types for input/output.
Intersects with TQ types when plugin is configured.

**Done when**:
- [ ] Generates valid .d.ts augmentation
- [ ] Each operation typed with correct input/output
- [ ] TQ types intersected when plugin present
- [ ] pathKey typed per API
- [ ] Writes atomically (temp file + rename)

---

### T6: Codegen orchestrator

**What**: Tie the full pipeline together: config → resolve → parse → extract → generate all
**Where**: `src/codegen/index.ts`
**Depends on**: T5

Single `generate()` function that takes DefineConfigInput + cwd,
runs the full pipeline for all APIs, outputs manifest + .d.ts.

**Done when**:
- [ ] Processes all APIs in config
- [ ] Creates node_modules/.magia/ directory
- [ ] Writes manifest.ts, .d.ts, internals/
- [ ] Reports errors per API (doesn't stop on first failure)

---

### T7: Integration tests

**What**: Test full pipeline with real petstore spec
**Where**: `src/__tests__/codegen.test.ts`
**Depends on**: T6

**Done when**:
- [ ] Full pipeline test with petstore OpenAPI spec
- [ ] Manifest has correct operations
- [ ] .d.ts is valid TypeScript
- [ ] All tests pass
