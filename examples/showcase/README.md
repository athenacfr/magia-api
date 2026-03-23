# Magia Showcase

REST + GraphQL through one API surface — with Tailwind, TanStack Query, and zero ceremony.

## What this demonstrates

- **Two APIs, one config** — PokeAPI (REST/OpenAPI) and Rick and Morty (GraphQL) side by side
- **TanStack Query** — `queryOptions`, pagination, cache
- **safeFetch** — Error handling without try/catch
- **Interceptors** — Request logging via `onRequest` hooks
- **Typed everything** — Full TypeScript from schema to component

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173

## Files

```
magia.config.ts              — REST + GraphQL in one config
schema.graphql               — Rick and Morty SDL schema
src/
  lib/magia.ts               — Runtime client with interceptors
  components/
    RickAndMortyTab.tsx       — Character grid, pagination, detail view
    CharacterDetail.tsx       — Single character with episodes
    PokemonTab.tsx            — Pokemon grid, pagination, safeFetch demo
```
