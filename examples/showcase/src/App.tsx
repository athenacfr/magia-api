import { useState } from "react";
import { RickAndMortyTab } from "./components/RickAndMortyTab";
import { PokemonTab } from "./components/PokemonTab";
import { FeaturesTab } from "./components/FeaturesTab";

const tabs = [
  { id: "features", label: "Features", badge: "API" },
  { id: "rickandmorty", label: "Rick and Morty", badge: "GraphQL" },
  { id: "pokemon", label: "Pokemon", badge: "REST" },
] as const;

type TabId = (typeof tabs)[number]["id"];

const badgeColors: Record<string, string> = {
  GraphQL: "bg-pink-500/10 text-pink-400",
  REST: "bg-emerald-500/10 text-emerald-400",
  API: "bg-blue-500/10 text-blue-400",
};

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>("features");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">magia</h1>
              <p className="text-sm text-zinc-500">REST + GraphQL through one API surface</p>
            </div>
            <a
              href="https://github.com/athenacfr/magia-api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-6">
        <nav className="flex gap-1 border-b border-zinc-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === tab.id ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${badgeColors[tab.badge]}`}
                >
                  {tab.badge}
                </span>
              </span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-zinc-100" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === "rickandmorty" && <RickAndMortyTab />}
        {activeTab === "pokemon" && <PokemonTab />}
        {activeTab === "features" && <FeaturesTab />}
      </main>
    </div>
  );
}
