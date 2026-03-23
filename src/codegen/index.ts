import { resolve, relative, dirname } from 'node:path'
import { mkdir, writeFile, rename, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import type { DefineConfigInput, MagiaPlugin } from '../types'
import { resolveSchema } from '../schema'
import { parseSpec } from './parser'
import { extractOperations, type ExtractedOperation } from './extractor'
import { generateTypes, writeSpecFile } from './hey-api'
import { generateGenFile } from './gen-file'

export interface GenerateOptions {
  config: DefineConfigInput
  cwd?: string
  /** Only generate these APIs (default: all) */
  filter?: string[]
}

export interface GenerateResult {
  genFilePath: string
  apis: Record<string, { operations: number; typesDir: string }>
  errors: Array<{ apiName: string; error: Error }>
}

/**
 * Resolve where magia.gen.ts goes.
 * Respects config.output, otherwise defaults to src/magia.gen.ts if src/ exists.
 */
function resolveGenFilePath(cwd: string, config: DefineConfigInput): string {
  if (config.output) return resolve(cwd, config.output)
  const srcDir = resolve(cwd, 'src')
  const dir = existsSync(srcDir) ? srcDir : cwd
  return resolve(dir, 'magia.gen.ts')
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

  const genFilePath = resolveGenFilePath(cwd, opts.config)
  const apiNames = opts.filter ?? Object.keys(opts.config.apis)
  const genApis: Record<string, {
    operations: ExtractedOperation[]
    plugins: MagiaPlugin[]
    typesImportPath: string
    exportedTypes: Set<string>
  }> = {}
  const result: GenerateResult = {
    genFilePath: '',
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

      // 6. Scan Hey API output for available type names
      const indexContent = await readFile(resolve(typesDir, 'index.ts'), 'utf-8')
      const exportedTypes = new Set(
        [...indexContent.matchAll(/\b(\w+(?:Data|Response))\b/g)].map(m => m[1]),
      )

      // 7. Collect for gen file
      const plugins = apiConfig.plugins ?? []
      const typesRelative = relative(dirname(genFilePath), typesDir).replace(/\\/g, '/')
      const typesImportPath = typesRelative.startsWith('.') ? typesRelative : `./${typesRelative}`

      genApis[apiName] = { operations, plugins, typesImportPath, exportedTypes }
      result.apis[apiName] = { operations: operations.length, typesDir }
    } catch (err) {
      result.errors.push({
        apiName,
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  // 7. Generate magia.gen.ts (manifest + type augmentation)
  if (Object.keys(genApis).length > 0) {
    const source = generateGenFile(genApis)
    await atomicWrite(genFilePath, source)
    result.genFilePath = genFilePath
  }

  return result
}
