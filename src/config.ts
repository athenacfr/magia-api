import type { DefineConfigInput } from './types'

/**
 * Identity function that provides type inference for magia-api.config.ts.
 * No transformation — just returns the config as-is.
 */
export function defineConfig(config: DefineConfigInput): DefineConfigInput {
  return config
}
