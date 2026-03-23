import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { magia } from "../lib/magia";
import { CharacterDetail } from "./CharacterDetail";

const statusColors: Record<string, string> = {
  Alive: "bg-emerald-500",
  Dead: "bg-red-500",
  unknown: "bg-zinc-500",
};

export function RickAndMortyTab() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery(
    magia.rickandmorty.GetCharacters.queryOptions({ page }),
  );

  if (selectedId) {
    return <CharacterDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Characters</h2>
          {data?.characters?.info && (
            <p className="text-sm text-zinc-500">
              {data.characters.info.count} characters across {data.characters.info.pages} pages
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400 tabular-nums min-w-[80px] text-center">
            Page {page} of {data?.characters?.info?.pages ?? "..."}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!data?.characters?.info?.next}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-zinc-900 h-[200px] animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          {error.message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {data.characters?.results?.map((char) => (
            <button
              key={char?.id}
              onClick={() => setSelectedId(char?.id ?? null)}
              className="group rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden text-left hover:border-zinc-600 transition-colors"
            >
              <div className="aspect-square overflow-hidden">
                <img
                  src={char?.image ?? ""}
                  alt={char?.name ?? ""}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${statusColors[char?.status ?? "unknown"]}`}
                  />
                  <span className="text-sm font-medium truncate">{char?.name}</span>
                </div>
                <p className="text-xs text-zinc-500 truncate">
                  {char?.species} &middot; {char?.location?.name}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
