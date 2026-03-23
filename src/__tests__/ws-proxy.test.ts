import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMagia } from "../proxy";
import type { Manifest } from "../types";

describe("WS subscription routing in proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const manifest: Manifest = {
    api: {
      plugins: [],
      operations: {
        regularGet: {
          type: "rest",
          method: "GET",
          path: "/data",
          params: {},
        },
        sseStream: {
          type: "rest",
          method: "POST",
          path: "/stream",
          params: { body: "body" },
          sse: true,
        },
        wsStream: {
          type: "rest",
          method: "GET",
          path: "/ws/{symbol}",
          params: { symbol: "path" },
          ws: true,
        },
        bothStream: {
          type: "rest",
          method: "GET",
          path: "/both",
          params: {},
          sse: true,
          ws: true,
        },
      },
    },
    graphqlApi: {
      plugins: [],
      operations: {
        onMessage: {
          type: "graphql",
          kind: "subscription",
          document: "subscription { onMessage { text } }",
        },
        getUser: {
          type: "graphql",
          kind: "query",
          document: "query { user { name } }",
        },
      },
    },
  };

  it("subscribe throws for non-subscription operations", async () => {
    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" },
        graphqlApi: { baseUrl: "https://graphql.example.com" },
      },
    }) as any;

    const iter = magia.api.regularGet.subscribe();
    await expect(iter[Symbol.asyncIterator]().next()).rejects.toThrow(
      "does not support .subscribe()",
    );
  });

  it("subscribe routes REST SSE to SSE dispatch", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":1}\n\n'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" },
        graphqlApi: { baseUrl: "https://graphql.example.com" },
      },
    }) as any;

    const events: unknown[] = [];
    for await (const event of magia.api.sseStream.subscribe({ message: "hi" })) {
      events.push(event);
    }

    expect(events).toEqual([{ id: 1 }]);
  });

  it("subscribe falls back to SSE for GraphQL when no wsUrl", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"data":{"onMessage":{"text":"hi"}}}\n\n'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" },
        graphqlApi: { baseUrl: "https://graphql.example.com" }, // no wsUrl
      },
    }) as any;

    const events: unknown[] = [];
    for await (const event of magia.graphqlApi.onMessage.subscribe({})) {
      events.push(event);
    }

    expect(events).toEqual([{ onMessage: { text: "hi" } }]);
    // Used fetch (SSE), not WebSocket
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("transport: 'sse' forces SSE even when wsUrl is configured", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"data":{"onMessage":{"text":"forced-sse"}}}\n\n'),
        );
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" },
        graphqlApi: {
          baseUrl: "https://graphql.example.com",
          wsUrl: "wss://graphql.example.com", // WS configured
        },
      },
    }) as any;

    const events: unknown[] = [];
    for await (const event of magia.graphqlApi.onMessage.subscribe(
      {},
      { transport: "sse" }, // Force SSE
    )) {
      events.push(event);
    }

    expect(events).toEqual([{ onMessage: { text: "forced-sse" } }]);
    // Used fetch (SSE), not WebSocket
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("REST WS not routed when no wsUrl configured", async () => {
    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" }, // no wsUrl
        graphqlApi: { baseUrl: "https://graphql.example.com" },
      },
    }) as any;

    // ws: true but no wsUrl → should throw (not SSE either, since sse is not set)
    const iter = magia.api.wsStream.subscribe({ symbol: "btc" });
    await expect(iter[Symbol.asyncIterator]().next()).rejects.toThrow(
      "does not support .subscribe()",
    );
  });

  it("REST endpoint with both sse+ws falls back to SSE when no wsUrl", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"tick":1}\n\n'));
        controller.close();
      },
    });

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });

    const magia = createMagia({
      manifest,
      apis: {
        api: { baseUrl: "https://api.example.com" }, // no wsUrl
        graphqlApi: { baseUrl: "https://graphql.example.com" },
      },
    }) as any;

    // Has both sse: true and ws: true, but no wsUrl → falls through to SSE
    const events: unknown[] = [];
    for await (const event of magia.api.bothStream.subscribe()) {
      events.push(event);
    }

    expect(events).toEqual([{ tick: 1 }]);
  });
});
