import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { magia } from "../lib/magia";

export function PokemonTab() {
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const { data, isLoading, error } = useQuery(
    magia.pokeapi.apiV2PokemonList.queryOptions({ limit, offset }),
  );

  const totalPages = data?.count ? Math.ceil(data.count / limit) : 0;
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Pokemon</h2>
          {data?.count && <p className="text-sm text-zinc-500">{data.count} pokemon</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
            disabled={offset === 0}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-400 tabular-nums min-w-[80px] text-center">
            Page {currentPage} of {totalPages || "..."}
          </span>
          <button
            onClick={() => setOffset((o) => o + limit)}
            disabled={!data?.next}
            className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-zinc-900 h-[140px] animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          {error.message}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {data.results?.map((pokemon) => {
            const id = pokemon.url?.match(/\/(\d+)\/$/)?.[1];
            const spriteUrl = id
              ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
              : null;

            return (
              <div
                key={pokemon.name}
                className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 flex flex-col items-center gap-2 hover:border-zinc-600 transition-colors"
              >
                {spriteUrl && (
                  <img
                    src={spriteUrl}
                    alt={pokemon.name ?? ""}
                    className="w-16 h-16"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                <span className="text-sm font-medium capitalize">{pokemon.name}</span>
                <span className="text-xs text-zinc-500 font-mono">#{id?.padStart(3, "0")}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
