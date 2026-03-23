import type { Compiler } from "webpack";
import { resolve } from "node:path";
import { resolveConfig } from "./loader";
import { generate } from "./codegen/index";
import { classifySource } from "./schema";

export interface MagiaApiOptions {
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Force regeneration on every build (default: false) */
  force?: boolean;
}

/**
 * Webpack plugin for magia-api.
 * Triggers codegen before compilation starts.
 * In watch mode, adds local schema files to fileDependencies for auto-rebuild.
 */
export class MagiaApiPlugin {
  private opts: MagiaApiOptions;

  constructor(opts: MagiaApiOptions = {}) {
    this.opts = opts;
  }

  apply(compiler: Compiler) {
    let magiaConfig: Awaited<ReturnType<typeof resolveConfig>>["config"] | null = null;

    compiler.hooks.beforeCompile.tapPromise("magia-api", async () => {
      const cwd = this.opts.cwd ?? process.cwd();

      try {
        const resolved = await resolveConfig(cwd);
        magiaConfig = resolved.config;

        const result = await generate({ config: magiaConfig, cwd, force: this.opts.force });

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

    // Add local schema files to webpack's file dependencies for watch mode
    compiler.hooks.afterCompile.tap("magia-api", (compilation) => {
      if (!magiaConfig) return;
      const cwd = this.opts.cwd ?? process.cwd();

      for (const [, apiConfig] of Object.entries(magiaConfig.apis)) {
        const kind = classifySource(apiConfig.schema);
        if (kind === "local-file") {
          const schemaPath = resolve(cwd, apiConfig.schema as string);
          compilation.fileDependencies.add(schemaPath);
        }
      }
    });
  }
}
