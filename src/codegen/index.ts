import { resolve, relative, dirname } from 'node:path'
import { mkdir, writeFile, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import type { DefineConfigInput, MagiaPlugin } from '../types'
import { resolveSchema } from '../schema'
import { parseSpec } from './parser'
import { extractOperations, type ExtractedOperation } from './extractor'
import { generateTypes, writeSpecFile } from './hey-api'
import { generateManifestSource } from './manifest-gen'
import { generateDts } from './dts-gen'

export interface GenerateOptions {
  config: DefineConfigInput
  cwd?: string
  /** Only generate these APIs (default: all) */
  filter?: string[]
}

export interface GenerateResult {
  manifestPath: string
  dtsPath: string
  apis: Record<string, { operations: number; typesDir: string }>
  errors: Array<{ apiName: string; error: Error }>
}

/**
 * Resolve where generated files go in the user's source tree.
 * Default: src/ if it exists, else project root.
 */
function resolveGenDir(cwd: string): string {
  const srcDir = resolve(cwd, 'src')
  return existsSync(srcDir) ? srcDir : cwd
}

function resolveDtsPath(cwd: string, config: DefineConfigInput): string {
  if (config.dtsPath) return resolve(cwd, config.dtsPath)
  return resolve(resolveGenDir(cwd), 'magia-api.d.ts')
}

function resolveManifestPath(cwd: string): string {
  return resolve(resolveGenDir(cwd), 'magia.gen.ts')
}

/**
 * Write a file atomically (write to temp, then rename).
 */
async function atomicWrite(filePath: string, content: string): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}`
  await writeFile(tmpPath, content, 'utf-8')
  await rename(tmpPath, filePath)
}

/**
 * Run the full codegen pipeline for all APIs in the config.
 */
export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const cwd = opts.cwd ?? process.cwd()
  const outputDir = resolve(cwd, 'node_modules', '.magia')
  await mkdir(outputDir, { recursive: true })

  const apiNames = opts.filter ?? Object.keys(opts.config.apis)
  const manifestApis: Record<string, { operations: ExtractedOperation[]; plugins: MagiaPlugin[] }> = {}
  const dtsApis: Record<string, {
    operations: ExtractedOperation[]
    plugins: MagiaPlugin[]
    typesImportPath: string
    spec: ReturnType<typeof parseSpec>
  }> = {}
  const result: GenerateResult = {
    manifestPath: '',
    dtsPath: '',
    apis: {},
    errors: [],
  }

  for (const apiName of apiNames) {
    const apiConfig = opts.config.apis[apiName]
    if (!apiConfig) {
      result.errors.push({ apiName, error: new Error(`API "${apiName}" not found in config`) })
      continue
    }

    // v1: REST only
    if (apiConfig.type !== 'rest') {
      result.errors.push({
        apiName,
        error: new Error(`API type "${apiConfig.type}" not supported in v1. Only "rest" is supported.`),
      })
      continue
    }

    try {
      // 1. Resolve schema
      const specText = await resolveSchema({
        apiName,
        source: apiConfig.schema,
        cwd,
      })

      // 2. Parse spec
      const spec = parseSpec(specText)

      // 3. Extract operations
      const operations = extractOperations(spec, {
        operationName: apiConfig.operationName,
      })

      // 4. Write spec file for Hey API
      const specPath = await writeSpecFile(outputDir, apiName, specText)

      // 5. Generate types via Hey API
      const typesDir = await generateTypes({
        apiName,
        specPath,
        outputDir,
      })

      // 6. Collect for manifest and .d.ts generation
      const plugins = apiConfig.plugins ?? []
      manifestApis[apiName] = { operations, plugins }

      // Calculate relative import path from .d.ts location to Hey API types
      const dtsPath = resolveDtsPath(cwd, opts.config)
      const typesRelative = relative(dirname(dtsPath), typesDir).replace(/\\/g, '/')
      const typesImportPath = typesRelative.startsWith('.') ? typesRelative : `./${typesRelative}`

      dtsApis[apiName] = {
        operations,
        plugins,
        typesImportPath,
        spec,
      }

      result.apis[apiName] = { operations: operations.length, typesDir }
    } catch (err) {
      result.errors.push({
        apiName,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  // 7. Generate magia.gen.ts (manifest) in user's src/
  if (Object.keys(manifestApis).length > 0) {
    const manifestSource = generateManifestSource(manifestApis)
    const manifestPath = resolveManifestPath(cwd)
    await atomicWrite(manifestPath, manifestSource)
    result.manifestPath = manifestPath
  }

  // 8. Generate magia-api.d.ts (type augmentation) in user's src/
  if (Object.keys(dtsApis).length > 0) {
    const dtsSource = generateDts(dtsApis)
    const dtsPath = resolveDtsPath(cwd, opts.config)
    await atomicWrite(dtsPath, dtsSource)
    result.dtsPath = dtsPath
  }

  return result
}
