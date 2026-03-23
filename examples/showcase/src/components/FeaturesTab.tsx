import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { magia } from "../lib/magia";

export function FeaturesTab() {
  return (
    <div className="space-y-8">
      <SafeFetchDemo />
      <TransformErrorDemo />
      <ContextBagDemo />
      <QueryKeyDemo />
      <AbortDemo />
      <SubscribeDemo />
      <WSConfigDemo />
    </div>
  );
}

// Feature: safeFetch — { data, error } without try/catch
function SafeFetchDemo() {
  const [result, setResult] = useState<string | null>(null);
  const [resultType, setResultType] = useState<"success" | "error">("success");

  async function fetchPikachu() {
    const { data, error } = await magia.pokeapi.apiV2PokemonRetrieve.safeFetch({
      id: "pikachu",
    });
    if (error) {
      setResultType("error");
      setResult(error.message);
    } else {
      setResultType("success");
      setResult(`Pikachu — ${data.height}dm tall, ${data.weight}hg, ${data.types?.length} type(s)`);
    }
  }

  async function fetchInvalid() {
    const { data: _data, error } = await magia.pokeapi.apiV2PokemonRetrieve.safeFetch({
      id: "not-a-real-pokemon-999",
    });
    if (error) {
      setResultType("error");
      setResult(`${error.code} (${error.status}): ${error.message}`);
    }
  }

  return (
    <Card
      title="safeFetch"
      description="Error handling without try/catch. Returns { data, error } — one is always null."
      feature="safeFetch"
    >
      <div className="flex gap-2">
        <DemoButton onClick={fetchPikachu} label="Fetch Pikachu" variant="green" />
        <DemoButton onClick={fetchInvalid} label="Fetch Invalid" variant="red" />
      </div>
      {result && (
        <ResultBanner type={resultType} onDismiss={() => setResult(null)}>
          {result}
        </ResultBanner>
      )}
      <CodeBlock>{`// No try/catch needed — error is typed
const { data, error } = await magia.pokeapi.getPokemon.safeFetch({
  id: "pikachu",
})

if (error) {
  // error: MagiaError — has .status, .code, .data
  console.log(error.code)    // "404"
  console.log(error.status)  // 404
} else {
  // data is fully typed from OpenAPI spec
  console.log(data.height)   // 4
}`}</CodeBlock>
    </Card>
  );
}

// Feature: transformError — custom error messages
function TransformErrorDemo() {
  const [result, setResult] = useState<string | null>(null);

  async function triggerTransform() {
    const { error } = await magia.pokeapi.apiV2PokemonRetrieve.safeFetch({
      id: "does-not-exist",
    });
    if (error) {
      // transformError in magia.ts rewrites 404 messages
      setResult(`Transformed: "${error.message}" (original would be a generic 404)`);
    }
  }

  return (
    <Card
      title="transformError"
      description="Customize error messages before they reach your components. Configured per-API in createMagia."
      feature="transformError"
    >
      <DemoButton onClick={triggerTransform} label="Trigger 404" variant="amber" />
      {result && (
        <ResultBanner type="error" onDismiss={() => setResult(null)}>
          {result}
        </ResultBanner>
      )}
      <CodeBlock>{`// In createMagia config — runs before error reaches your code
const magia = createMagia({
  apis: {
    pokeapi: {
      baseUrl: "https://pokeapi.co",
      transformError: (error) => {
        if (error.status === 404) {
          error.message = \`Pokemon not found: \${error.operation}\`
        }
        return error
      },
    },
  },
})`}</CodeBlock>
    </Card>
  );
}

// Feature: context bag — per-request metadata passed to interceptors
function ContextBagDemo() {
  const [result, setResult] = useState<string | null>(null);

  async function fetchWithContext() {
    const requestId = `demo-${Date.now()}`;
    await magia.pokeapi.apiV2PokemonRetrieve.fetch(
      { id: "charizard" },
      { context: { requestId, source: "features-tab" } },
    );
    setResult(
      `Charizard fetched with context.requestId="${requestId}" — check console for interceptor logs`,
    );
  }

  return (
    <Card
      title="Context Bag"
      description="Pass per-request metadata to interceptors without polluting the API call. Useful for tracing, auth tokens, feature flags."
      feature="context"
    >
      <DemoButton onClick={fetchWithContext} label="Fetch with Context" variant="purple" />
      {result && (
        <ResultBanner type="success" onDismiss={() => setResult(null)}>
          {result}
        </ResultBanner>
      )}
      <CodeBlock>{`// Pass metadata per-request — available in all interceptors
await magia.pokeapi.getPokemon.fetch(
  { id: "charizard" },
  { context: { requestId: "abc-123", source: "features-tab" } }
)

// Access in interceptor config
onRequest: (ctx) => {
  ctx.headers["X-Request-ID"] = ctx.context.requestId
  console.log(ctx.context.source) // "features-tab"
}`}</CodeBlock>
    </Card>
  );
}

// Feature: queryKey / pathKey — cache management
function QueryKeyDemo() {
  const queryClient = useQueryClient();
  const [log, setLog] = useState<string[]>([]);

  // Prefetch to populate cache
  useQuery(magia.pokeapi.apiV2PokemonList.queryOptions({ limit: 5, offset: 0 }));

  function showQueryKey() {
    const key = magia.pokeapi.apiV2PokemonList.queryKey({ limit: 5, offset: 0 });
    setLog((prev) => [...prev, `queryKey: ${JSON.stringify(key)}`]);
  }

  function showPathKey() {
    const key = magia.pokeapi.pathKey();
    setLog((prev) => [...prev, `pathKey: ${JSON.stringify(key)}`]);
  }

  function invalidateApi() {
    queryClient.invalidateQueries({ queryKey: magia.pokeapi.pathKey() });
    setLog((prev) => [...prev, `Invalidated all pokeapi queries`]);
  }

  function invalidateOperation() {
    queryClient.invalidateQueries({
      queryKey: magia.pokeapi.apiV2PokemonList.queryKey({ limit: 5, offset: 0 }),
    });
    setLog((prev) => [...prev, `Invalidated apiV2PokemonList(limit:5, offset:0)`]);
  }

  return (
    <Card
      title="queryKey / pathKey"
      description="Typed cache keys for TanStack Query. pathKey() matches all queries for an API, queryKey() matches a specific operation+params."
      feature="queryKey"
    >
      <div className="flex flex-wrap gap-2">
        <DemoButton onClick={showQueryKey} label="Show queryKey" variant="blue" />
        <DemoButton onClick={showPathKey} label="Show pathKey" variant="blue" />
        <DemoButton onClick={invalidateOperation} label="Invalidate Operation" variant="amber" />
        <DemoButton onClick={invalidateApi} label="Invalidate All pokeapi" variant="red" />
      </div>
      {log.length > 0 && (
        <div className="mt-3 space-y-1">
          {log.map((entry, i) => (
            <div
              key={i}
              className="text-xs font-mono text-zinc-400 bg-zinc-900 rounded px-3 py-1.5"
            >
              {entry}
            </div>
          ))}
          <button onClick={() => setLog([])} className="text-xs text-zinc-600 hover:text-zinc-400">
            Clear log
          </button>
        </div>
      )}
      <CodeBlock>{`// Hierarchical keys — TanStack Query partial matching
const key = magia.pokeapi.listPokemon.queryKey({ limit: 5 })
// → ["magia", "pokeapi", "listPokemon", { limit: 5 }]

const apiKey = magia.pokeapi.pathKey()
// → ["magia", "pokeapi"]

// Invalidate one operation
queryClient.invalidateQueries({ queryKey: key })

// Invalidate ALL queries for an API
queryClient.invalidateQueries({ queryKey: apiKey })`}</CodeBlock>
    </Card>
  );
}

// Feature: abort — cancel in-flight requests
function AbortDemo() {
  const [result, setResult] = useState<string | null>(null);

  async function fetchAndAbort() {
    const controller = new AbortController();

    // Abort after 1ms to guarantee cancellation
    setTimeout(() => controller.abort(), 1);

    const { error } = await magia.pokeapi.apiV2PokemonRetrieve.safeFetch(
      { id: "slowpoke" },
      { signal: controller.signal },
    );

    if (error) {
      const isAbort = error.code === "ABORTED";
      setResult(`${isAbort ? "Aborted" : "Error"}: ${error.message} (code: ${error.code})`);
    }
  }

  return (
    <Card
      title="Abort / Signal"
      description="Cancel in-flight requests with AbortController. MagiaError.code === 'ABORTED' distinguishes cancellations from real errors."
      feature="signal"
    >
      <DemoButton onClick={fetchAndAbort} label="Fetch & Abort Slowpoke" variant="red" />
      {result && (
        <ResultBanner type="error" onDismiss={() => setResult(null)}>
          {result}
        </ResultBanner>
      )}
      <CodeBlock>{`const controller = new AbortController()

// Pass signal to any .fetch() or .safeFetch()
const { error } = await magia.pokeapi.getPokemon.safeFetch(
  { id: "slowpoke" },
  { signal: controller.signal }
)

// Cancel from anywhere
controller.abort()

// Distinguish aborts from real errors
if (error?.code === "ABORTED") {
  // user cancelled — not a real error
} else if (error?.code === "TIMEOUT") {
  // request timed out (from timeout config)
}`}</CodeBlock>
    </Card>
  );
}

// Feature: subscribe — AsyncIterable subscription pattern
function SubscribeDemo() {
  const [events, setEvents] = useState<string[]>([]);
  const [active, setActive] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  function startSubscription() {
    // Simulate what a real magia subscription looks like:
    //
    //   for await (const event of magia.myApi.onPriceUpdate.subscribe(
    //     { symbol: "BTC" },
    //     { reconnect: true }
    //   )) {
    //     console.log(event.price)
    //   }
    //
    // This demo simulates events since PokeAPI/Rick&Morty don't have subscriptions.

    const ctrl = new AbortController();
    setController(ctrl);
    setActive(true);
    setEvents([]);

    let count = 0;
    const interval = setInterval(() => {
      if (ctrl.signal.aborted) {
        clearInterval(interval);
        return;
      }
      count++;
      const price = (42000 + Math.random() * 2000).toFixed(2);
      setEvents((prev) => [...prev.slice(-7), `Event #${count}: BTC $${price}`]);
    }, 800);

    // Auto-stop after 15 events
    setTimeout(() => {
      if (!ctrl.signal.aborted) {
        ctrl.abort();
        clearInterval(interval);
        setActive(false);
        setEvents((prev) => [...prev, "— subscription completed"]);
      }
    }, 12000);
  }

  function stopSubscription() {
    controller?.abort();
    setActive(false);
    setEvents((prev) => [...prev, "— aborted by user"]);
  }

  return (
    <Card
      title=".subscribe()"
      description="Real-time subscriptions via WebSocket or SSE. Returns AsyncIterable — use for await...of. Cancel with AbortSignal."
      feature="subscribe"
    >
      <div className="flex gap-2 items-center">
        {!active ? (
          <DemoButton onClick={startSubscription} label="Start Subscription" variant="green" />
        ) : (
          <DemoButton onClick={stopSubscription} label="Stop" variant="red" />
        )}
        {active && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            live
          </span>
        )}
      </div>
      {events.length > 0 && (
        <div className="mt-3 space-y-0.5">
          {events.map((event, i) => (
            <div
              key={i}
              className={`text-xs font-mono px-3 py-1 rounded ${
                event.startsWith("—")
                  ? "text-zinc-500 bg-zinc-900/50"
                  : "text-emerald-300 bg-zinc-900"
              }`}
            >
              {event}
            </div>
          ))}
        </div>
      )}
      <CodeBlock>{`// WebSocket (graphql-transport-ws protocol)
for await (const event of magia.crypto.onPriceUpdate.subscribe(
  { symbol: "BTC" },
  { reconnect: true }
)) {
  updateUI(event.price)
}

// Cancel with AbortSignal
const ctrl = new AbortController()
magia.crypto.onPriceUpdate.subscribe(
  { symbol: "ETH" },
  { signal: ctrl.signal }
)
ctrl.abort() // closes connection`}</CodeBlock>
    </Card>
  );
}

// Feature: WS config — wsUrl, connectionParams, lazy close
function WSConfigDemo() {
  const [activeExample, setActiveExample] = useState<"minimal" | "auth" | "rest">("minimal");

  const examples = {
    minimal: {
      label: "Minimal (GraphQL)",
      description: "Just add wsUrl — WS is used automatically for subscriptions",
      code: `const magia = createMagia({
  manifest,
  apis: {
    graphqlApi: {
      baseUrl: "https://api.example.com/graphql",
      wsUrl: "wss://api.example.com/graphql",
    },
  },
})`,
    },
    auth: {
      label: "With Auth (GraphQL)",
      description: "connectionParams sent in ConnectionInit — supports async for token refresh",
      code: `const magia = createMagia({
  manifest,
  apis: {
    graphqlApi: {
      baseUrl: "https://api.example.com/graphql",
      wsUrl: "wss://ws.example.com/graphql",
      ws: {
        connectionParams: async () => ({
          token: await getAccessToken(),
        }),
        closeTimeout: 5000,  // keep alive 5s after last unsub
        retryAttempts: 10,
      },
    },
  },
})`,
    },
    rest: {
      label: "REST WebSocket",
      description: "wsUrl is the base — operation path is appended, like baseUrl for HTTP",
      code: `const magia = createMagia({
  manifest,
  apis: {
    streamApi: {
      baseUrl: "https://api.example.com",
      wsUrl: "wss://stream.example.com",
      // Auth via URL params — no special config needed
    },
  },
})

// subscribes to wss://stream.example.com/ws/btcusdt
for await (const tick of magia.streamApi.priceStream.subscribe(
  { symbol: "btcusdt" }
)) {
  console.log(tick)
}`,
    },
  };

  const active = examples[activeExample];

  return (
    <Card
      title="WS Configuration"
      description="WebSocket support alongside SSE. Lazy connections, multiplexed GraphQL subscriptions, exponential backoff reconnection."
      feature="wsUrl"
    >
      <div className="flex gap-1.5 mb-4">
        {(Object.keys(examples) as (keyof typeof examples)[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveExample(key)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              activeExample === key
                ? "bg-violet-500/20 text-violet-300"
                : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {examples[key].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mb-3">{active.description}</p>
      <CodeBlock>{active.code}</CodeBlock>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/50 p-3">
          <div className="text-[10px] font-mono text-violet-400 mb-1">connection</div>
          <div className="text-xs text-zinc-400">Lazy — connects on first .subscribe()</div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/50 p-3">
          <div className="text-[10px] font-mono text-violet-400 mb-1">multiplexing</div>
          <div className="text-xs text-zinc-400">GraphQL: shared WS, multiplexed by ID</div>
        </div>
        <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/50 p-3">
          <div className="text-[10px] font-mono text-violet-400 mb-1">reconnect</div>
          <div className="text-xs text-zinc-400">Exponential backoff + jitter, 5 retries</div>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="mt-4 rounded-lg bg-zinc-900 border border-zinc-800 p-4">
      <pre className="text-xs font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap">
        {children}
      </pre>
    </div>
  );
}

function Card({
  title,
  description,
  feature,
  children,
}: {
  title: string;
  description: string;
  feature: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-xl">{description}</p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-500">
          {feature}
        </span>
      </div>
      {children}
    </div>
  );
}

const buttonVariants: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
  red: "bg-red-500/10 text-red-400 hover:bg-red-500/20",
  amber: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  blue: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20",
  purple: "bg-purple-500/10 text-purple-400 hover:bg-purple-500/20",
};

function DemoButton({
  onClick,
  label,
  variant,
}: {
  onClick: () => void;
  label: string;
  variant: keyof typeof buttonVariants;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${buttonVariants[variant]}`}
    >
      {label}
    </button>
  );
}

function ResultBanner({
  type,
  onDismiss,
  children,
}: {
  type: "success" | "error";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const colors =
    type === "success"
      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
      : "bg-red-500/10 border-red-500/20 text-red-300";

  return (
    <div
      className={`mt-3 rounded-lg border p-3 text-sm flex items-center justify-between ${colors}`}
    >
      <span className="font-mono text-xs">{children}</span>
      <button onClick={onDismiss} className="ml-4 opacity-50 hover:opacity-100">
        &times;
      </button>
    </div>
  );
}
