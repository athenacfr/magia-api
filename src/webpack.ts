import type { Compiler } from "webpack";
import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";

export interface MagiaApiOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Force regeneration on every build (default: false) */
  force?: boolean;
}

/**
 * Webpack plugin for magia-api.
 * Triggers codegen before compilation starts.
 */
export class MagiaApiPlugin {
  private opts: MagiaApiOptions;

  constructor(opts: MagiaApiOptions = {}) {
    this.opts = opts;
  }

  apply(compiler: Compiler) {
    compiler.hooks.beforeCompile.tapPromise("magia-api", async () => {
      const cwd = this.opts.cwd ?? process.cwd();

      try {
        const { config } = await resolveConfig(cwd);
        const result = await generate({ config, cwd, force: this.opts.force });

        if (result.errors.length > 0) {
          for (const { apiName, error } of result.errors) {
            console.error(`[magia-api] ${apiName}: ${error.message}`);
          }
        }

        const opCount = Object.values(result.apis).reduce((sum, a) => sum + a.operations, 0);
        const apiCount = Object.keys(result.apis).length;
        const skipped = result.skipped.length;
        const parts = [`Generated ${opCount} operations from ${apiCount} API(s)`];
        if (skipped > 0) parts.push(`${skipped} unchanged (skipped)`);
        console.log(`[magia-api] ${parts.join(", ")}`);
      } catch (err) {
        console.error(`[magia-api] Generation failed: ${err instanceof Error ? err.message : err}`);
      }
    });
  }
}
