import type { Plugin, ViteDevServer } from 'vite'
import { resolve } from 'node:path'
import { watch } from 'node:fs'
import { resolveConfig } from './loader'
import { generate } from './codegen/index'
import { classifySource } from './schema'
import type { DefineConfigInput } from './types'

/**
 * Vite plugin for magia-api.
 * - Triggers codegen on server start / build
 * - Watches local schema files for changes (dev only)
 * - Triggers HMR when manifest regenerates
 */
export function magiaApi(): Plugin {
  let server: ViteDevServer | null = null
  let manifestPath: string | null = null
  const watchers: ReturnType<typeof watch>[] = []

  async function runGenerate(cwd: string, magiaConfig: DefineConfigInput, filter?: string[]) {
    const result = await generate({ config: magiaConfig, cwd, filter })

    if (result.errors.length > 0) {
      for (const { apiName, error } of result.errors) {
        console.error(`[magia-api] ${apiName}: ${error.message}`)
      }
    }

    if (result.manifestPath) {
      manifestPath = result.manifestPath
    }

    return result
  }

  return {
    name: 'magia-api',

    configureServer(srv) {
      server = srv
    },

    async configResolved(config) {
      const cwd = config.root ?? process.cwd()

      try {
        const { config: magiaConfig } = await resolveConfig(cwd)

        const result = await runGenerate(cwd, magiaConfig)

        const apiCount = Object.keys(result.apis).length
        const opCount = Object.values(result.apis).reduce((sum, a) => sum + a.operations, 0)
        console.log(`[magia-api] Generated ${opCount} operations from ${apiCount} API(s)`)

        if (config.command === 'serve') {
          setupWatchers(cwd, magiaConfig)
        }
      } catch (err) {
        console.error(`[magia-api] Generation failed:`, err instanceof Error ? err.message : err)
      }
    },

    async buildEnd() {
      for (const w of watchers) {
        w.close()
      }
      watchers.length = 0
    },
  }

  function setupWatchers(cwd: string, magiaConfig: DefineConfigInput) {
    for (const [apiName, apiConfig] of Object.entries(magiaConfig.apis)) {
      const kind = classifySource(apiConfig.schema)
      const shouldWatch = apiConfig.schemaWatch ?? (kind === 'local-file')

      if (!shouldWatch || kind !== 'local-file') continue

      const schemaPath = resolve(cwd, apiConfig.schema as string)
      let debounceTimer: ReturnType<typeof setTimeout> | null = null

      const watcher = watch(schemaPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(async () => {
          console.log(`[magia-api] Schema changed: ${apiName}, regenerating...`)
          try {
            await runGenerate(cwd, magiaConfig, [apiName])

            // magia.gen.ts is in src/ — Vite watches src/ by default
            // so HMR picks up the file change automatically
            // Force full reload to ensure manifest is re-evaluated
            if (server) {
              server.ws.send({ type: 'full-reload' })
            }
          } catch (err) {
            console.error(`[magia-api] Regeneration failed:`, err instanceof Error ? err.message : err)
          }
        }, 200)
      })

      watchers.push(watcher)
    }
  }
}
