import { MagiaError } from "./error";

// ---------------------------------------------------------------------------
// Fatal close codes from graphql-transport-ws spec — do not retry
// ---------------------------------------------------------------------------

const FATAL_CLOSE_CODES = new Set([
  4400, // BadRequest
  4401, // Unauthorized
  4406, // SubprotocolNotAcceptable
  4409, // SubscriberAlreadyExists
  4429, // TooManyInitRequests
  4500, // InternalServerError
]);

// ---------------------------------------------------------------------------
// Error context (same shape as proxy.ts ErrorContext)
// ---------------------------------------------------------------------------

export interface WSErrorContext {
  label: string;
  api: string;
  operation: string;
}

export function wrapWSCloseEvent(event: CloseEvent, ctx: WSErrorContext): MagiaError {
  return new MagiaError(`WebSocket closed: ${event.reason || event.code}`, {
    status: event.code,
    code: `WS_CLOSE_${event.code}`,
    api: ctx.api,
    operation: ctx.operation,
    data: { code: event.code, reason: event.reason },
  });
}

export function wrapWSError(ctx: WSErrorContext): MagiaError {
  return new MagiaError(`WebSocket error`, {
    status: 0,
    code: "WS_ERROR",
    api: ctx.api,
    operation: ctx.operation,
    data: undefined,
  });
}

// ---------------------------------------------------------------------------
// WSConnection — low-level WebSocket lifecycle manager
// ---------------------------------------------------------------------------

export interface WSConnectionConfig {
  url: string | (() => string);
  protocols?: string | string[];
  /** Custom WebSocket constructor (for older Node.js) */
  webSocketImpl?: unknown;
  /** Max retry attempts (0 = no retry) */
  retryAttempts?: number;
  /** Called on each incoming message (already JSON-parsed) */
  onMessage: (data: unknown) => void;
  /** Called on connection error */
  onError?: (error: MagiaError) => void;
  /** Called when connection closes */
  onClose?: (code: number, reason: string) => void;
  /** Called after successful reconnection */
  onReconnect?: () => void | Promise<void>;
}

type WSState = "idle" | "connecting" | "connected" | "closed";

export class WSConnection {
  private ws: WebSocket | null = null;
  private state: WSState = "idle";
  private retryCount = 0;
  private intentionalClose = false;

  constructor(
    private config: WSConnectionConfig,
    private errorContext: WSErrorContext,
  ) {}

  get connected(): boolean {
    return this.state === "connected";
  }

  async connect(): Promise<void> {
    if (this.state === "connected") return;
    if (this.state === "connecting") {
      // Wait for in-flight connection
      return this.waitForConnection();
    }

    this.state = "connecting";
    this.intentionalClose = false;

    return new Promise<void>((resolve, reject) => {
      const url = typeof this.config.url === "function" ? this.config.url() : this.config.url;
      const WS = (this.config.webSocketImpl ?? globalThis.WebSocket) as typeof WebSocket;
      const ws = new WS(url, this.config.protocols);

      ws.onopen = () => {
        this.ws = ws;
        this.state = "connected";
        this.retryCount = 0;
        resolve();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          this.config.onMessage(data);
        } catch {
          // Not JSON — pass raw string
          this.config.onMessage(event.data);
        }
      };

      ws.onerror = () => {
        if (this.state === "connecting") {
          const err = wrapWSError(this.errorContext);
          this.config.onError?.(err);
          this.state = "closed";
          reject(err);
        }
      };

      ws.onclose = (event) => {
        const wasPreviouslyConnected = this.state === "connected";
        this.ws = null;
        this.state = "closed";

        this.config.onClose?.(event.code, event.reason);

        // Don't retry if intentional close or fatal code
        if (this.intentionalClose) return;
        if (FATAL_CLOSE_CODES.has(event.code)) {
          const err = wrapWSCloseEvent(event, this.errorContext);
          this.config.onError?.(err);
          return;
        }

        // Attempt reconnection
        if (wasPreviouslyConnected) {
          this.attemptReconnect();
        }
      };
    });
  }

  send(data: unknown): void {
    if (!this.ws || this.state !== "connected") {
      throw wrapWSError(this.errorContext);
    }
    this.ws.send(JSON.stringify(data));
  }

  close(): void {
    this.intentionalClose = true;
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
    }
    this.state = "closed";
  }

  private async attemptReconnect(): Promise<void> {
    const maxRetries = this.config.retryAttempts ?? 0;
    if (maxRetries <= 0) return;

    while (this.retryCount < maxRetries && !this.intentionalClose) {
      this.retryCount++;

      // Exponential backoff with jitter: 2^attempt * 1000 + random(300, 3000)
      const delay =
        Math.pow(2, this.retryCount - 1) * 1000 + Math.floor(Math.random() * 2700 + 300);
      await new Promise((r) => setTimeout(r, delay));

      if (this.intentionalClose) return;

      try {
        await this.connect();
        // Notify about reconnection (for re-subscribing)
        await this.config.onReconnect?.();
        return;
      } catch {
        // connect() failed — loop will retry
      }
    }
  }

  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (this.state === "connected") {
          clearInterval(check);
          resolve();
        } else if (this.state === "closed" || this.state === "idle") {
          clearInterval(check);
          reject(wrapWSError(this.errorContext));
        }
      }, 50);
    });
  }
}
