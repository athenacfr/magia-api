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
        console.log(`[magia-api] Generated ${opCount} operations from ${apiCount} API(s)`);
      } catch (err) {
        this.error(`magia-api generation failed: ${err instanceof Error ? err.message : err}`);
      }
    },

    closeBundle() {
      for (const w of watchers) w.close();
      watchers.length = 0;
    },
  };
}
