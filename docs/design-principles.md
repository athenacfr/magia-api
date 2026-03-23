# Design Principles

These principles guide every API decision in Magia. They exist so contributors and users understand _why_ things work the way they do.

## Own every abstraction

Magia never leaks its dependencies into your code. You import from `magia-api` — never from the codegen or fetch libraries underneath. Types, errors, interceptors, and configuration are all Magia-owned surfaces.

This means we can swap internals without breaking your code. It also means error messages, stack traces, and TypeScript hints all come from Magia, not from a library you didn't choose.

## One config, full stack

A single `magia.config.ts` drives codegen, runtime client creation, and framework integrations. REST and GraphQL share the same config shape, the same client API, and the same plugin system.

You shouldn't need to learn two different tools, two different CLIs, or two different plugin models just because your backend has both REST and GraphQL endpoints.

## Types are generated, never maintained

If a type can be derived from a schema, it should be. Hand-maintained types drift from the API, cause subtle bugs, and waste time. Magia generates everything at build time from the source of truth — your OpenAPI or GraphQL schema.

## No magic at runtime

The runtime client is a thin, predictable layer. No proxies that hide behavior, no implicit global state, no framework coupling. `fetch()` calls `fetch`. `queryOptions()` returns a plain object. You can inspect, debug, and test everything with standard tools.

## Escape hatches, not lock-in

Magia generates a single `.gen.ts` file. If you decide to stop using Magia, keep the file. Your types still work. The runtime client uses standard `fetch` under the hood — there's no proprietary protocol to migrate away from.

Every abstraction Magia provides (interceptors, error handling, query integration) is optional. You can use as much or as little as your project needs.

## Minimal surface, maximum leverage

We don't add features to check boxes. Every API surface must justify its existence by solving a real problem that most users face. A smaller API is easier to learn, easier to maintain, and harder to misuse.

When in doubt, leave it out. It's easier to add an API later than to remove one.
