#!/usr/bin/env node

import { resolveConfig } from './loader'
import { generate } from './codegen/index'

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (!command || command === 'generate') {
    const filter = args.slice(1).filter(a => !a.startsWith('-'))
    await runGenerate(filter.length > 0 ? filter : undefined)
  } else if (command === '--help' || command === '-h') {
    printHelp()
  } else {
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
  }
}

function printHelp() {
  console.log(`
magia-api — Zero-ceremony typed API client generation

Usage:
  magia-api generate [api...]    Generate types and manifest (default)
  magia-api --help               Show this help

Examples:
  magia-api generate             Generate all APIs
  magia-api generate petstore    Generate only petstore
  magia-api                      Same as 'generate'
`.trim())
}

async function runGenerate(filter?: string[]) {
  const startTime = Date.now()

  try {
    const { config, configPath } = await resolveConfig()
    console.log(`Config: ${configPath}`)

    const result = await generate({ config, filter })

    // Report results
    for (const [apiName, api] of Object.entries(result.apis)) {
      console.log(`  ${apiName}: ${api.operations} operations`)
    }

    // Report errors
    for (const { apiName, error } of result.errors) {
      console.error(`  ${apiName}: ERROR — ${error.message}`)
    }

    if (result.manifestPath) {
      console.log(`Manifest: ${result.manifestPath}`)
    }
    if (result.dtsPath) {
      console.log(`Types: ${result.dtsPath}`)
    }

    const elapsed = Date.now() - startTime
    console.log(`Done in ${elapsed}ms`)

    if (result.errors.length > 0) {
      process.exit(1)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main()
