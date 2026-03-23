import type { Plugin } from "esbuild";
import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";

export interface MagiaApiOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Force regeneration (default: false) */
  force?: boolean;
}

/**
 * esbuild plugin for magia-api.
 * Triggers codegen at the start of each build.
 */
export function magiaApi(opts: MagiaApiOptions = {}): Plugin {
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
          console.log(`[magia-api] Generated ${opCount} operations from ${apiCount} API(s)`);
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
    },
  };
}
