import { useQuery } from "@tanstack/react-query";
import { magia } from "../lib/magia";

const statusColors: Record<string, string> = {
  Alive: "text-emerald-400",
  Dead: "text-red-400",
  unknown: "text-zinc-400",
};

export function CharacterDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data, isLoading } = useQuery(magia.rickandmorty.GetCharacter.queryOptions({ id }));

  const char = data?.character;

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6 flex items-center gap-1"
      >
        &larr; Back to list
      </button>

      {isLoading && (
        <div className="flex gap-8">
          <div className="w-64 h-64 rounded-2xl bg-zinc-900 animate-pulse shrink-0" />
          <div className="flex-1 space-y-4">
            <div className="h-8 w-48 bg-zinc-900 rounded animate-pulse" />
            <div className="h-4 w-32 bg-zinc-900 rounded animate-pulse" />
          </div>
        </div>
      )}

      {char && (
        <div className="flex flex-col md:flex-row gap-8">
          <img
            src={char.image ?? ""}
            alt={char.name ?? ""}
            className="w-64 h-64 rounded-2xl object-cover shrink-0"
          />
          <div className="flex-1">
            <h2 className="text-2xl font-semibold mb-1">{char.name}</h2>
            <p className={`text-sm mb-6 ${statusColors[char.status ?? "unknown"]}`}>
              {char.status} &middot; {char.species}
              {char.type ? ` &middot; ${char.type}` : ""}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Gender</p>
                <p className="text-sm">{char.gender}</p>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4">
                <p className="text-xs text-zinc-500 mb-1">Origin</p>
                <p className="text-sm truncate">{char.origin?.name}</p>
              </div>
              <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 col-span-2">
                <p className="text-xs text-zinc-500 mb-1">Location</p>
                <p className="text-sm">{char.location?.name}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium mb-3">Episodes ({char.episode?.length ?? 0})</h3>
              <div className="flex flex-wrap gap-2">
                {char.episode?.slice(0, 20).map((ep) => (
                  <span
                    key={ep?.id}
                    className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-400"
                    title={ep?.name ?? ""}
                  >
                    {ep?.episode}
                  </span>
                ))}
                {(char.episode?.length ?? 0) > 20 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-zinc-800 text-zinc-500">
                    +{(char.episode?.length ?? 0) - 20} more
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
