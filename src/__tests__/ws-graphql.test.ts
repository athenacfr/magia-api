import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphQLWSClient } from "../ws-graphql";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

function createMockWebSocket() {
  const instances: MockWS[] = [];

  class MockWS {
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: CloseEvent) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    sent: unknown[] = [];
    readyState = 0;

    constructor(
      public url: string,
      public protocols?: string | string[],
    ) {
      instances.push(this);
      // Auto-open after microtask (simulates real WS behavior)
      Promise.resolve().then(() => this.simulateOpen());
    }

    send(data: string) {
      this.sent.push(JSON.parse(data));
    }

    close(_code?: number) {
      this.readyState = 3;
    }

    simulateOpen() {
      this.readyState = 1;
      this.onopen?.(new Event("open"));
    }

    simulateMessage(data: unknown) {
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    }

    simulateClose(code = 1000, reason = "") {
      this.readyState = 3;
      this.onclose?.(new CloseEvent("close", { code, reason }));
    }
  }

  return { MockWS, instances };
}

describe("GraphQLWSClient", () => {
  let mockWS: ReturnType<typeof createMockWebSocket>;

  beforeEach(() => {
    mockWS = createMockWebSocket();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createClient(overrides: Record<string, unknown> = {}) {
    return new GraphQLWSClient(
      {
        wsUrl: "wss://api.example.com/graphql",
        webSocketImpl: mockWS.MockWS,
        retryAttempts: 0,
        ...overrides,
      },
      "testApi",
    );
  }

  /** Wait for microtasks to flush (connection establishment) */
  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
  }

  /** Send connection_ack to the latest mock WS instance */
  function ack(instanceIndex = 0) {
    mockWS.instances[instanceIndex].simulateMessage({ type: "connection_ack" });
  }

  it("connects with graphql-transport-ws subprotocol", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    const nextPromise = asyncIter.next();

    // Wait for WS to be created and opened
    await flush();
    ack();
    await flush();

    // Server sends data
    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "0",
      payload: { data: { onMessage: { text: "hello" } } },
    });

    const result = await nextPromise;
    expect(result.value).toEqual({ onMessage: { text: "hello" } });
    expect(mockWS.instances[0].protocols).toBe("graphql-transport-ws");

    client.dispose();
  });

  it("sends connection_init with connectionParams", async () => {
    const client = createClient({
      connectionParams: { token: "abc" },
    });

    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {
      channel: "general",
    });
    iter[Symbol.asyncIterator]().next();

    await flush();

    expect(mockWS.instances[0].sent[0]).toEqual({
      type: "connection_init",
      payload: { token: "abc" },
    });

    ack();
    await flush();

    expect(mockWS.instances[0].sent[1]).toEqual({
      type: "subscribe",
      id: "0",
      payload: {
        query: "subscription { onMessage { text } }",
        variables: { channel: "general" },
      },
    });

    client.dispose();
  });

  it("supports async connectionParams", async () => {
    const client = createClient({
      connectionParams: async () => ({ token: "async-token" }),
    });

    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    iter[Symbol.asyncIterator]().next();

    await flush();
    await flush(); // extra flush for async connectionParams

    expect(mockWS.instances[0].sent[0]).toEqual({
      type: "connection_init",
      payload: { token: "async-token" },
    });

    client.dispose();
  });

  it("multiplexes multiple subscriptions over one connection", async () => {
    const client = createClient();

    const iter1 = client.subscribe("onA", "subscription { onA { id } }", {});
    const next1 = iter1[Symbol.asyncIterator]().next();

    await flush();
    ack();
    await flush();

    const iter2 = client.subscribe("onB", "subscription { onB { id } }", {});
    const next2 = iter2[Symbol.asyncIterator]().next();
    await flush();

    // Only one WebSocket instance
    expect(mockWS.instances).toHaveLength(1);

    const subscribes = mockWS.instances[0].sent.filter((m: any) => m.type === "subscribe");
    expect(subscribes).toHaveLength(2);

    // Route messages to correct subscriptions
    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "0",
      payload: { data: { onA: { id: 1 } } },
    });
    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "1",
      payload: { data: { onB: { id: 2 } } },
    });

    const result1 = await next1;
    const result2 = await next2;
    expect(result1.value).toEqual({ onA: { id: 1 } });
    expect(result2.value).toEqual({ onB: { id: 2 } });

    client.dispose();
  });

  it("completes subscription when server sends complete", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    const firstPromise = asyncIter.next(); // start generator

    await flush();
    ack();
    await flush();

    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "0",
      payload: { data: { onMessage: { text: "hi" } } },
    });
    mockWS.instances[0].simulateMessage({ type: "complete", id: "0" });

    const first = await firstPromise;
    expect(first.value).toEqual({ onMessage: { text: "hi" } });

    const done = await asyncIter.next();
    expect(done.done).toBe(true);

    client.dispose();
  });

  it("throws MagiaError on GraphQL errors in next payload", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    const nextPromise = asyncIter.next(); // start generator — this will receive the error

    await flush();
    ack();
    await flush();

    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "0",
      payload: { errors: [{ message: "field not found" }] },
    });

    await expect(nextPromise).rejects.toThrow("field not found");

    client.dispose();
  });

  it("throws MagiaError on server error message", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    const nextPromise = asyncIter.next(); // start generator — this will receive the error

    await flush();
    ack();
    await flush();

    mockWS.instances[0].simulateMessage({
      type: "error",
      id: "0",
      payload: [{ message: "subscription failed" }],
    });

    await expect(nextPromise).rejects.toThrow("subscription failed");

    client.dispose();
  });

  it("responds to server ping with pong", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    iter[Symbol.asyncIterator]().next();

    await flush();
    ack();
    await flush();

    mockWS.instances[0].simulateMessage({ type: "ping", payload: { ts: 123 } });

    const pong = mockWS.instances[0].sent.find((m: any) => m.type === "pong");
    expect(pong).toEqual({ type: "pong", payload: { ts: 123 } });

    client.dispose();
  });

  it("calls onSubscriptionEvent for each data event", async () => {
    const onSubscriptionEvent = vi.fn();
    const client = createClient({ onSubscriptionEvent });

    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    const nextPromise = asyncIter.next(); // start generator — will receive the value

    await flush();
    ack();
    await flush();

    mockWS.instances[0].simulateMessage({
      type: "next",
      id: "0",
      payload: { data: { onMessage: { text: "hi" } } },
    });

    await nextPromise;
    expect(onSubscriptionEvent).toHaveBeenCalledWith({ onMessage: { text: "hi" } });

    client.dispose();
  });

  it("omits variables when input is empty", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    iter[Symbol.asyncIterator]().next();

    await flush();
    ack();
    await flush();

    const subscribeMsg = mockWS.instances[0].sent.find((m: any) => m.type === "subscribe") as any;
    expect(subscribeMsg.payload).toEqual({
      query: "subscription { onMessage { text } }",
    });
    expect(subscribeMsg.payload.variables).toBeUndefined();

    client.dispose();
  });

  it("dispose() closes connection and completes all subscriptions", async () => {
    const client = createClient();
    const iter = client.subscribe("onMessage", "subscription { onMessage { text } }", {});
    const asyncIter = iter[Symbol.asyncIterator]();
    asyncIter.next(); // start generator

    await flush();
    ack();
    await flush();

    client.dispose();

    const result = await asyncIter.next();
    expect(result.done).toBe(true);
    expect(client.activeCount).toBe(0);
  });
});
