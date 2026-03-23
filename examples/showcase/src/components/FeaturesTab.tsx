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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

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
