import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@hey-api/openapi-ts'

export interface HeyApiOptions {
  /** API name (used for output subdirectory) */
  apiName: string
  /** Path to the OpenAPI spec file (written to temp for Hey API) */
  specPath: string
  /** Base output directory (e.g. node_modules/.magia) */
  outputDir: string
}

/**
 * Run Hey API to generate TypeScript types from an OpenAPI spec.
 * Only generates types — no SDK, no client.
 */
export async function generateTypes(opts: HeyApiOptions): Promise<string> {
  const typesDir = resolve(opts.outputDir, 'internals', opts.apiName)
  await mkdir(typesDir, { recursive: true })

  await createClient({
    input: opts.specPath,
    output: typesDir,
    plugins: ['@hey-api/typescript'],
  })

  return typesDir
}

/**
 * Write schema text to a temp file for Hey API to consume.
 * Returns the path to the temp file.
 */
export async function writeSpecFile(
  outputDir: string,
  apiName: string,
  specText: string,
): Promise<string> {
  const schemasDir = resolve(outputDir, 'schemas')
  await mkdir(schemasDir, { recursive: true })

  const specPath = resolve(schemasDir, `${apiName}.json`)
  await writeFile(specPath, specText, 'utf-8')
  return specPath
}
