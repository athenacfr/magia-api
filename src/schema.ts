import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { SchemaSource, SchemaScript } from "./types";

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Source classification
// ---------------------------------------------------------------------------

export type SchemaSourceKind = "url" | "local-file" | "async-fn" | "script";

function isUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

const LOCAL_URL_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?/,
  /^https?:\/\/127\.\d+\.\d+\.\d+/,
  /^https?:\/\/10\.\d+\.\d+\.\d+/,
  /^https?:\/\/192\.168\.\d+\.\d+/,
];

export function isLocalUrl(s: string): boolean {
  return LOCAL_URL_PATTERNS.some((p) => p.test(s));
}

export function classifySource(source: SchemaSource): SchemaSourceKind {
  if (typeof source === "function") return "async-fn";
  if (typeof source === "object" && "command" in source) return "script";
  if (typeof source === "string" && isUrl(source)) return "url";
  return "local-file";
}

// ---------------------------------------------------------------------------
// Env var override
// ---------------------------------------------------------------------------

/**
 * Check for MAGIA_<API>_SCHEMA env var override.
 * Returns the override source or null.
 */
export function getSchemaEnvOverride(apiName: string): string | null {
  const envKey = `MAGIA_${apiName.toUpperCase()}_SCHEMA`;
  return process.env[envKey] ?? null;
}

// ---------------------------------------------------------------------------
// Schema resolution
// ---------------------------------------------------------------------------

async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch schema from ${url}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

async function readLocalFile(filePath: string, cwd: string): Promise<string> {
  const absolute = resolve(cwd, filePath);
  try {
    return await readFile(absolute, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read schema file: ${absolute}`, { cause: err });
  }
}

async function runScript(script: SchemaScript, cwd: string): Promise<string> {
  try {
    await execAsync(script.command, { cwd });
  } catch (err) {
    throw new Error(`Schema script failed: ${script.command}`, { cause: err });
  }

  const outputPath = resolve(cwd, script.output);
  try {
    return await readFile(outputPath, "utf-8");
  } catch (err) {
    throw new Error(`Schema script ran but output file not found: ${outputPath}`, { cause: err });
  }
}

export interface ResolveSchemaOptions {
  apiName: string;
  source: SchemaSource;
  cwd?: string;
}

/**
 * Resolve a SchemaSource into schema text.
 * Checks for env var override first, then resolves based on source type.
 */
export async function resolveSchema(opts: ResolveSchemaOptions): Promise<string> {
  const cwd = opts.cwd ?? process.cwd();

  // Env var override takes precedence
  const envOverride = getSchemaEnvOverride(opts.apiName);
  const source = envOverride ?? opts.source;

  const kind = classifySource(source);

  switch (kind) {
    case "url":
      return fetchUrl(source as string);
    case "local-file":
      return readLocalFile(source as string, cwd);
    case "async-fn":
      return (source as () => Promise<string>)();
    case "script":
      return runScript(source as SchemaScript, cwd);
  }
}

// ---------------------------------------------------------------------------
// Smart defaults for watch/cache (used by Vite plugin & CLI)
// ---------------------------------------------------------------------------

export interface SchemaDefaults {
  watch: boolean;
  cache: "disabled" | { ttl: string };
}

export function getSchemaDefaults(source: SchemaSource): SchemaDefaults {
  const kind = classifySource(source);

  if (kind === "local-file") {
    return { watch: true, cache: "disabled" };
  }

  if (kind === "url" && typeof source === "string" && isLocalUrl(source)) {
    return { watch: true, cache: "disabled" };
  }

  // Remote URL, async fn, script
  return { watch: false, cache: { ttl: "1h" } };
}
