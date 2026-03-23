import type { Plugin } from "esbuild";
import { resolve } from "node:path";
import { watch, type FSWatcher } from "node:fs";
import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";
import { classifySource } from "./schema";
import type { DefineConfigInput } from "./types";

export interface MagiaApiOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Force regeneration (default: false) */
  force?: boolean;
  /** Watch local schema files for changes (default: true) */
  watch?: boolean;
}

/**
 * esbuild plugin for magia-api.
 * Triggers codegen at the start of each build.
 * Optionally watches local schema files for changes.
 */
export function magiaApi(opts: MagiaApiOptions = {}): Plugin {
  const watchers: FSWatcher[] = [];
  let watchersSetUp = false;

  return {
    name: "magia-api",

    setup(build) {
      build.onStart(async () => {
        const cwd = opts.cwd ?? process.cwd();

        try {
          const { config } = await resolveConfig(cwd);
          const result = await generate({ config, cwd, force: opts.force });

          if (result.errors.length > 0) {
            return {
              errors: result.errors.map(({ apiName, error }) => ({
                text: `${apiName}: ${error.message}`,
                pluginName: "magia-api",
              })),
            };
          }

          const opCount = Object.values(result.apis).reduce((sum, a) => sum + a.operations, 0);
          const apiCount = Object.keys(result.apis).length;
          const skipped = result.skipped.length;
          const parts = [`Generated ${opCount} operations from ${apiCount} API(s)`];
          if (skipped > 0) parts.push(`${skipped} unchanged (skipped)`);
          console.log(`[magia-api] ${parts.join(", ")}`);

          // Set up file watchers for local schemas (only once)
          if (opts.watch !== false && !watchersSetUp) {
            setupWatchers(cwd, config);
            watchersSetUp = true;
          }
        } catch (err) {
          return {
            errors: [
              {
                text: `Generation failed: ${err instanceof Error ? err.message : err}`,
                pluginName: "magia-api",
              },
            ],
          };
        }
      });

      // Clean up watchers when esbuild disposes the plugin
      build.onEnd(() => {
        // onEnd fires after each build — watchers persist across rebuilds
      });
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
