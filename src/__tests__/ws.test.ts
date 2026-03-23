import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WSConnection } from "../ws";

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

type WSListener = {
  onopen: ((ev: Event) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
};

function createMockWebSocket() {
  const instances: (MockWS & WSListener)[] = [];

  class MockWS {
    onopen: ((ev: Event) => void) | null = null;
    onclose: ((ev: { code: number; reason: string }) => void) | null = null;
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    sent: string[] = [];
    readyState = 0; // CONNECTING

    constructor(
      public url: string,
      public protocols?: string | string[],
    ) {
      instances.push(this as MockWS & WSListener);
    }

    send(data: string) {
      this.sent.push(data);
    }

    close(_code?: number) {
      this.readyState = 3; // CLOSED
    }

    // Test helpers
    simulateOpen() {
      this.readyState = 1; // OPEN
      this.onopen?.(new Event("open"));
    }

    simulateMessage(data: unknown) {
      this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
    }

    simulateClose(code = 1000, reason = "") {
      this.readyState = 3;
      this.onclose?.({ code, reason });
    }

    simulateError() {
      this.onerror?.(new Event("error"));
    }
  }

  return { MockWS, instances };
}

const errorCtx = { label: "test", api: "testApi", operation: "testOp" };

describe("WSConnection", () => {
  let mockWS: ReturnType<typeof createMockWebSocket>;

  beforeEach(() => {
    mockWS = createMockWebSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("connects and resolves when socket opens", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();

    // Simulate open
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    expect(conn.connected).toBe(true);
    expect(mockWS.instances[0].url).toBe("wss://example.com");
  });

  it("rejects when socket errors during connection", async () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, onError, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateError();

    await expect(connectPromise).rejects.toThrow("WebSocket error");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("sends JSON messages", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    conn.send({ type: "subscribe", id: "1" });

    expect(mockWS.instances[0].sent).toEqual([JSON.stringify({ type: "subscribe", id: "1" })]);
  });

  it("parses incoming JSON messages", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    mockWS.instances[0].simulateMessage({ type: "next", id: "1", payload: { data: "hello" } });

    expect(onMessage).toHaveBeenCalledWith({
      type: "next",
      id: "1",
      payload: { data: "hello" },
    });
  });

  it("calls onClose when connection closes", async () => {
    const onMessage = vi.fn();
    const onClose = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, onClose, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    mockWS.instances[0].simulateClose(1000, "normal");

    expect(onClose).toHaveBeenCalledWith(1000, "normal");
  });

  it("throws when sending on closed connection", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      { url: "wss://example.com", onMessage, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    expect(() => conn.send({ type: "ping" })).toThrow("WebSocket error");
  });

  it("close() sets intentional flag and prevents retry", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      {
        url: "wss://example.com",
        onMessage,
        retryAttempts: 3,
        webSocketImpl: mockWS.MockWS,
      },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    conn.close();
    expect(conn.connected).toBe(false);

    // No retry attempts should happen
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mockWS.instances).toHaveLength(1); // only the original connection
  });

  it("does not retry on fatal close codes", async () => {
    const onMessage = vi.fn();
    const onError = vi.fn();
    const conn = new WSConnection(
      {
        url: "wss://example.com",
        onMessage,
        onError,
        retryAttempts: 5,
        webSocketImpl: mockWS.MockWS,
      },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    // Fatal close code (Unauthorized)
    mockWS.instances[0].simulateClose(4401, "Unauthorized");

    await vi.advanceTimersByTimeAsync(30_000);

    // Only 1 instance — no reconnection attempts
    expect(mockWS.instances).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].code).toBe("WS_CLOSE_4401");
  });

  it("supports protocols option", async () => {
    const onMessage = vi.fn();
    const conn = new WSConnection(
      {
        url: "wss://example.com",
        protocols: "graphql-transport-ws",
        onMessage,
        webSocketImpl: mockWS.MockWS,
      },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    expect(mockWS.instances[0].protocols).toBe("graphql-transport-ws");
  });

  it("supports dynamic URL function", async () => {
    const onMessage = vi.fn();
    const urlFn = vi.fn().mockReturnValue("wss://dynamic.example.com");
    const conn = new WSConnection(
      { url: urlFn, onMessage, webSocketImpl: mockWS.MockWS },
      errorCtx,
    );

    const connectPromise = conn.connect();
    mockWS.instances[0].simulateOpen();
    await connectPromise;

    expect(urlFn).toHaveBeenCalledOnce();
    expect(mockWS.instances[0].url).toBe("wss://dynamic.example.com");
  });
});
