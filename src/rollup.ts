import type { Plugin } from "rollup";
import { resolve } from "node:path";
import { watch } from "node:fs";
import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";
import { classifySource } from "./schema";
import type { DefineConfigInput } from "./types";

export interface MagiaApiOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Watch schema files for changes (default: true in watch mode) */
  watch?: boolean;
}

/**
 * Rollup plugin for magia-api.
 * Triggers codegen on build start. Watches schemas in watch mode.
 */
export function magiaApi(opts: MagiaApiOptions = {}): Plugin {
  const watchers: ReturnType<typeof watch>[] = [];
  let magiaConfig: DefineConfigInput;
  let watchersSetUp = false;

  return {
    name: "magia-api",

    async buildStart() {
      const cwd = opts.cwd ?? process.cwd();

      try {
        const resolved = await resolveConfig(cwd);
        magiaConfig = resolved.config;

        const result = await generate({ config: magiaConfig, cwd });

        if (result.errors.length > 0) {
          for (const { apiName, error } of result.errors) {
            this.warn(`${apiName}: ${error.message}`);
          }
        }

        const opCount = Object.values(result.apis).reduce((sum, a) => sum + a.operations, 0);
        const apiCount = Object.keys(result.apis).length;
        const skippedCount = result.skipped.length;
        const parts = [`Generated ${opCount} operations from ${apiCount} API(s)`];
        if (skippedCount > 0) parts.push(`${skippedCount} unchanged (skipped)`);
        console.log(`[magia-api] ${parts.join(", ")}`);

        // Set up file watchers for local schemas (only once)
        if (opts.watch !== false && !watchersSetUp) {
          setupWatchers(cwd, magiaConfig);
          watchersSetUp = true;
        }
      } catch (err) {
        this.error(`magia-api generation failed: ${err instanceof Error ? err.message : err}`);
      }
    },

    closeBundle() {
      for (const w of watchers) w.close();
      watchers.length = 0;
      watchersSetUp = false;
    },
  };

  function setupWatchers(cwd: string, config: DefineConfigInput) {
    for (const [apiName, apiConfig] of Object.entries(config.apis)) {
      const kind = classifySource(apiConfig.schema);
      const shouldWatch = apiConfig.schemaWatch ?? kind === "local-file";

      if (!shouldWatch || kind !== "local-file") continue;

      const schemaPath = resolve(cwd, apiConfig.schema as string);
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;

      const watcher = watch(schemaPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          console.log(`[magia-api] Schema changed: ${apiName}, regenerating...`);
          try {
            await generate({ config, cwd, filter: [apiName] });
          } catch (err) {
            console.error(
              `[magia-api] Regeneration failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        }, 200);
      });

      watchers.push(watcher);
    }
  }
}
