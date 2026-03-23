import { createMagia } from "magia-api";
import { manifest } from "../magia.gen";

// Feature: createMagia with full configuration
export const magia = createMagia({
  manifest,
  apis: {
    pokeapi: {
      baseUrl: "https://pokeapi.co",

      // Feature: retry and timeout per API
      retry: 2,
      timeout: 10_000,

      // Feature: transformError — customize errors before they reach your code
      transformError: (error) => {
        if (error.status === 404) {
          error.message = `Pokemon not found: ${error.operation}`;
        }
        return error;
      },

      // Feature: onRequest interceptor with context bag
      onRequest: async (ctx) => {
        // Access per-request context set by the caller
        const requestId = ctx.context.requestId ?? crypto.randomUUID().slice(0, 8);
        ctx.headers["X-Request-ID"] = requestId;
        console.log(`[pokeapi] ${ctx.method} ${ctx.url} (rid: ${requestId})`);
      },

      // Feature: onResponse interceptor
      onResponse: async (ctx) => {
        console.log(`[pokeapi] ${ctx.status} ${ctx.operation} (${ctx.context.requestId ?? "?"})`);
      },

      // Feature: onResponseError interceptor
      onResponseError: async (ctx) => {
        console.error(`[pokeapi] ERROR ${ctx.status} ${ctx.operation}`, ctx.data);
      },
    },
    rickandmorty: {
      baseUrl: "https://rickandmortyapi.com/graphql",
      retry: 1,
      timeout: 8_000,

      onRequest: async (ctx) => {
        const requestId = ctx.context.requestId ?? crypto.randomUUID().slice(0, 8);
        ctx.headers["X-Request-ID"] = requestId;
        console.log(`[rickandmorty] ${ctx.operation} (rid: ${requestId})`);
      },

      onResponse: async (ctx) => {
        console.log(`[rickandmorty] ${ctx.status} ${ctx.operation}`);
      },
    },
  },
});
