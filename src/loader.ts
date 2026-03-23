import { createJiti } from "jiti";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import type { DefineConfigInput } from "./types";

const CONFIG_FILENAMES = [
  "magia.config.ts",
  "magia.config.js",
  "magia.config.mts",
  "magia.config.mjs",
];

/**
 * Find the config file by searching from cwd upward.
 * Returns the absolute path or null if not found.
 */
export function findConfigFile(cwd: string = process.cwd()): string | null {
  let dir = resolve(cwd);

  while (true) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = resolve(dir, filename);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null; // reached filesystem root
    dir = parent;
  }
}

/**
 * Load and return the magia-api config from the given file path.
 * Uses jiti to handle TypeScript files at runtime.
 */
export async function loadConfig(configPath: string): Promise<DefineConfigInput> {
  const jiti = createJiti(configPath);
  const mod = (await jiti.import(configPath)) as { default?: DefineConfigInput };

  const config = mod.default;
  if (!config || typeof config !== "object" || !("apis" in config)) {
    throw new Error(
      `Config file must have a default export with an 'apis' field: ${configPath}\n` +
        `Use: export default defineConfig({ apis: { ... } })`,
    );
  }

  return config as DefineConfigInput;
}

/**
 * Find and load the config file from cwd.
 * Convenience wrapper combining findConfigFile + loadConfig.
 */
export async function resolveConfig(
  cwd: string = process.cwd(),
): Promise<{ config: DefineConfigInput; configPath: string }> {
  const configPath = findConfigFile(cwd);
  if (!configPath) {
    throw new Error(
      `Could not find magia.config.ts in ${cwd} or parent directories.\n` +
        `Create one with: export default defineConfig({ apis: { ... } })`,
    );
  }

  const config = await loadConfig(configPath);
  return { config, configPath };
}
