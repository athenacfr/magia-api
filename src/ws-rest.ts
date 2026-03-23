import type {
  MagiaConfig,
  RestManifestEntry,
  MagiaApiConfig,
  MagiaSubscribeOptions,
} from "./types";
import { WSConnection, type WSErrorContext } from "./ws";
import { createAsyncIterableFromSink } from "./ws-shared";
import { buildUrl, extractBody } from "./proxy";

// ---------------------------------------------------------------------------
// REST WebSocket dispatch — dedicated connection per subscription
// ---------------------------------------------------------------------------

export function dispatchRestWS(
  config: MagiaConfig,
  apiName: string,
  operationName: string,
  entry: RestManifestEntry,
  apiConfig: MagiaApiConfig,
  input: Record<string, unknown>,
  opts: MagiaSubscribeOptions,
): AsyncIterable<unknown> {
  async function* generate(): AsyncIterable<unknown> {
    // Build WS URL using wsUrl as base (same pattern as baseUrl for HTTP)
    const url = buildUrl(apiConfig.wsUrl!, entry, input);
    const sink = createAsyncIterableFromSink<unknown>();

    const errorCtx: WSErrorContext = {
      label: `WS ${entry.path}`,
      api: apiName,
      operation: operationName,
    };

    const conn = new WSConnection(
      {
        url,
        retryAttempts: opts.reconnect ? (apiConfig.ws?.retryAttempts ?? 5) : 0,
        webSocketImpl: apiConfig.ws?.webSocketImpl,
        onMessage: (data) => {
          apiConfig.onSubscriptionEvent?.(data);
          sink.push(data);
        },
        onError: (err) => {
          apiConfig.onSubscriptionError?.(err);
          sink.error(err);
        },
        onClose: () => sink.complete(),
      },
      errorCtx,
    );

    await conn.connect();

    // Send body params as initial message (if any)
    const body = extractBody(entry, input);
    if (body != null) {
      conn.send(body);
    }

    // Handle abort signal
    opts.signal?.addEventListener("abort", () => conn.close(), { once: true });

    try {
      yield* sink.iterator;
    } finally {
      conn.close();
    }
  }

  return generate();
}
