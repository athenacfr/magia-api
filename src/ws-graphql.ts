import { MagiaError } from "./error";
import { WSConnection, wrapWSCloseEvent, type WSErrorContext } from "./ws";
import { createAsyncIterableFromSink } from "./ws-shared";
import type { MagiaGraphQLWSConfig } from "./types";

// ---------------------------------------------------------------------------
// graphql-transport-ws protocol message types
// ---------------------------------------------------------------------------

type ClientMessage =
  | { type: "connection_init"; payload?: Record<string, unknown> }
  | {
      type: "subscribe";
      id: string;
      payload: { query: string; variables?: Record<string, unknown> };
    }
  | { type: "complete"; id: string }
  | { type: "pong"; payload?: unknown };

type ServerMessage =
  | { type: "connection_ack"; payload?: unknown }
  | { type: "next"; id: string; payload: { data?: unknown; errors?: unknown[] } }
  | { type: "error"; id: string; payload: unknown[] }
  | { type: "complete"; id: string }
  | { type: "ping"; payload?: unknown }
  | { type: "pong"; payload?: unknown };

// ---------------------------------------------------------------------------
// Internal subscription tracking
// ---------------------------------------------------------------------------

interface ActiveSubscription {
  push: (value: unknown) => void;
  error: (err: Error) => void;
  complete: () => void;
  /** Stored for re-subscribing after reconnect */
  payload: { query: string; variables?: Record<string, unknown> };
  operationName: string;
}

// ---------------------------------------------------------------------------
// GraphQLWSClient — multiplexed subscriptions over a single WebSocket
// ---------------------------------------------------------------------------

export interface GraphQLWSClientConfig extends MagiaGraphQLWSConfig {
  wsUrl: string;
  onSubscriptionEvent?: (event: unknown) => void;
  onSubscriptionError?: (error: MagiaError) => void;
}

export class GraphQLWSClient {
  private connection: WSConnection | null = null;
  private subscriptions = new Map<string, ActiveSubscription>();
  private nextId = 0;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private acknowledged = false;
  private ackResolver: (() => void) | null = null;
  private ackRejecter: ((err: Error) => void) | null = null;
  private connecting = false;

  constructor(
    private config: GraphQLWSClientConfig,
    private apiName: string,
  ) {}

  get activeCount(): number {
    return this.subscriptions.size;
  }

  subscribe(
    operationName: string,
    document: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal,
  ): AsyncIterable<unknown> {
    const sink = createAsyncIterableFromSink<unknown>();
    const id = String(this.nextId++);
    const payload = {
      query: document,
      ...(Object.keys(variables).length > 0 ? { variables } : {}),
    };

    const sub: ActiveSubscription = {
      push: sink.push,
      error: sink.error,
      complete: sink.complete,
      payload,
      operationName,
    };

    const cleanup = () => {
      if (this.subscriptions.has(id)) {
        this.subscriptions.delete(id);
        // Tell server we're done
        if (this.connection?.connected) {
          try {
            this.connection.send({ type: "complete", id } satisfies ClientMessage);
          } catch {
            // Connection already closed
          }
        }
        this.maybeScheduleClose();
      }
    };

    // Handle abort signal
    signal?.addEventListener(
      "abort",
      () => {
        sink.complete();
        cleanup();
      },
      { once: true },
    );

    // Capture methods as bound closures for the generator (avoids this-alias lint)
    const cancelCloseTimer = () => this.cancelCloseTimer();
    const ensureConnected = () => this.ensureConnected();
    const subscriptions = this.subscriptions;
    const getConnection = () => this.connection;

    async function* generate(): AsyncIterable<unknown> {
      cancelCloseTimer();
      await ensureConnected();

      subscriptions.set(id, sub);
      getConnection()!.send({
        type: "subscribe",
        id,
        payload,
      } satisfies ClientMessage);

      try {
        yield* sink.iterator;
      } finally {
        cleanup();
      }
    }

    return generate();
  }

  dispose(): void {
    this.cancelCloseTimer();
    for (const [, sub] of this.subscriptions) {
      sub.complete();
    }
    this.subscriptions.clear();
    this.connection?.close();
    this.connection = null;
    this.acknowledged = false;
    this.connecting = false;
  }

  // ---------------------------------------------------------------------------
  // Connection management
  // ---------------------------------------------------------------------------

  private async ensureConnected(): Promise<void> {
    if (this.connection?.connected && this.acknowledged) return;

    if (this.connecting) {
      // Wait for in-flight connection
      return new Promise<void>((resolve, reject) => {
        const check = setInterval(() => {
          if (this.acknowledged) {
            clearInterval(check);
            resolve();
          } else if (!this.connecting) {
            clearInterval(check);
            reject(
              new MagiaError("WebSocket connection failed", {
                status: 0,
                code: "WS_ERROR",
                api: this.apiName,
                operation: "",
                data: undefined,
              }),
            );
          }
        }, 50);
      });
    }

    this.connecting = true;
    this.acknowledged = false;

    const errorCtx: WSErrorContext = {
      label: `GraphQL WS ${this.apiName}`,
      api: this.apiName,
      operation: "",
    };

    this.connection = new WSConnection(
      {
        url: this.config.wsUrl,
        protocols: "graphql-transport-ws",
        webSocketImpl: this.config.webSocketImpl,
        retryAttempts: this.config.retryAttempts ?? 5,
        onMessage: (data) => this.handleMessage(data),
        onError: (err) => {
          this.config.onSubscriptionError?.(err);
          // Propagate to all active subscriptions
          for (const [, sub] of this.subscriptions) {
            sub.error(err);
          }
        },
        onClose: (code, reason) => {
          this.acknowledged = false;
          this.connecting = false;
          // If unexpected close, propagate to active subs
          if (code !== 1000) {
            const err = wrapWSCloseEvent({ code, reason }, errorCtx);
            this.config.onSubscriptionError?.(err);
          }
        },
        onReconnect: () => this.onReconnect(),
      },
      errorCtx,
    );

    await this.connection.connect();
    await this.sendConnectionInit();
    this.connecting = false;
  }

  private async sendConnectionInit(): Promise<void> {
    let params: Record<string, unknown> | undefined;
    if (this.config.connectionParams) {
      params =
        typeof this.config.connectionParams === "function"
          ? await this.config.connectionParams()
          : this.config.connectionParams;
    }

    this.connection!.send({
      type: "connection_init",
      ...(params ? { payload: params } : {}),
    } satisfies ClientMessage);

    // Wait for connection_ack
    return new Promise<void>((resolve, reject) => {
      this.ackResolver = resolve;
      this.ackRejecter = reject;

      // Timeout for ack (10 seconds)
      setTimeout(() => {
        if (!this.acknowledged) {
          this.ackRejecter?.(
            new MagiaError("WebSocket ConnectionAck timeout", {
              status: 0,
              code: "WS_TIMEOUT",
              api: this.apiName,
              operation: "",
              data: undefined,
            }),
          );
          this.ackResolver = null;
          this.ackRejecter = null;
        }
      }, 10_000);
    });
  }

  // ---------------------------------------------------------------------------
  // Message routing
  // ---------------------------------------------------------------------------

  private handleMessage(raw: unknown): void {
    const msg = raw as ServerMessage;

    switch (msg.type) {
      case "connection_ack":
        this.acknowledged = true;
        this.ackResolver?.();
        this.ackResolver = null;
        this.ackRejecter = null;
        break;

      case "next": {
        const sub = this.subscriptions.get(msg.id);
        if (!sub) break;
        const envelope = msg.payload;
        if (envelope.errors?.length) {
          const firstErr = envelope.errors[0] as Record<string, unknown>;
          sub.error(
            new MagiaError(
              (firstErr.message as string) ?? `GraphQL subscription ${sub.operationName} error`,
              {
                status: 200,
                code: "GRAPHQL_ERROR",
                api: this.apiName,
                operation: sub.operationName,
                data: envelope.errors,
              },
            ),
          );
          this.subscriptions.delete(msg.id);
        } else if (envelope.data !== undefined) {
          this.config.onSubscriptionEvent?.(envelope.data);
          sub.push(envelope.data);
        }
        break;
      }

      case "error": {
        const sub = this.subscriptions.get(msg.id);
        if (!sub) break;
        const errors = msg.payload;
        const firstErr = (errors[0] ?? {}) as Record<string, unknown>;
        sub.error(
          new MagiaError(
            (firstErr.message as string) ?? `GraphQL subscription ${sub.operationName} error`,
            {
              status: 200,
              code: "GRAPHQL_ERROR",
              api: this.apiName,
              operation: sub.operationName,
              data: errors,
            },
          ),
        );
        this.subscriptions.delete(msg.id);
        this.maybeScheduleClose();
        break;
      }

      case "complete": {
        const sub = this.subscriptions.get(msg.id);
        if (sub) {
          sub.complete();
          this.subscriptions.delete(msg.id);
          this.maybeScheduleClose();
        }
        break;
      }

      case "ping":
        // Respond with pong
        if (this.connection?.connected) {
          this.connection.send({ type: "pong", payload: msg.payload } satisfies ClientMessage);
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Lazy close management
  // ---------------------------------------------------------------------------

  private maybeScheduleClose(): void {
    if (this.subscriptions.size > 0) return;

    const timeout = this.config.closeTimeout ?? 3000;
    this.closeTimer = setTimeout(() => {
      if (this.subscriptions.size === 0) {
        this.connection?.close();
        this.connection = null;
        this.acknowledged = false;
        this.connecting = false;
      }
    }, timeout);
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Reconnection — re-subscribe all active subscriptions
  // ---------------------------------------------------------------------------

  private async onReconnect(): Promise<void> {
    this.acknowledged = false;
    await this.sendConnectionInit();

    for (const [id, sub] of this.subscriptions) {
      this.connection!.send({
        type: "subscribe",
        id,
        payload: sub.payload,
      } satisfies ClientMessage);
    }
  }
}
