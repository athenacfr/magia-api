import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolveConfig } from './loader'
import { generate } from './codegen/index'

const VIRTUAL_MODULE_ID = 'virtual:magia-manifest'
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_MODULE_ID

/**
 * Vite plugin for magia-api.
 * - Triggers codegen on server start / build
 * - Resolves virtual:magia-manifest for runtime bundling
 */
export function magiaApi(): Plugin {
  let manifestPath: string | null = null

  return {
    name: 'magia-api',

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_ID
      }
    },

    async load(id) {
      if (id === RESOLVED_VIRTUAL_ID) {
        if (!manifestPath) {
          throw new Error(
            'magia-api: manifest not generated yet. ' +
            'Ensure configResolved hook ran successfully.',
          )
        }
        return readFile(manifestPath, 'utf-8')
      }
    },

    async configResolved(config) {
      const cwd = config.root ?? process.cwd()

      try {
        const { config: magiaConfig } = await resolveConfig(cwd)

        const result = await generate({ config: magiaConfig, cwd })

        if (result.errors.length > 0) {
          for (const { apiName, error } of result.errors) {
            console.error(`[magia-api] ${apiName}: ${error.message}`)
          }
        }

        if (result.manifestPath) {
          manifestPath = result.manifestPath
        }

        const apiCount = Object.keys(result.apis).length
        const opCount = Object.values(result.apis).reduce((sum, a) => sum + a.operations, 0)
        console.log(`[magia-api] Generated ${opCount} operations from ${apiCount} API(s)`)
      } catch (err) {
        console.error(`[magia-api] Generation failed:`, err instanceof Error ? err.message : err)
      }
    },
  }
}
