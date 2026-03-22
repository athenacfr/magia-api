import { parse as parseYaml } from 'yaml'

export interface OpenApiSpec {
  openapi: string
  info: { title: string; version: string }
  paths?: Record<string, OpenApiPathItem>
  components?: {
    schemas?: Record<string, unknown>
  }
}

export interface OpenApiPathItem {
  get?: OpenApiOperation
  post?: OpenApiOperation
  put?: OpenApiOperation
  delete?: OpenApiOperation
  patch?: OpenApiOperation
  parameters?: OpenApiParameter[]
}

export interface OpenApiOperation {
  operationId?: string
  summary?: string
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses?: Record<string, OpenApiResponse>
  tags?: string[]
}

export interface OpenApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  schema?: unknown
}

export interface OpenApiRequestBody {
  required?: boolean
  content?: Record<string, { schema?: unknown }>
}

export interface OpenApiResponse {
  description?: string
  content?: Record<string, { schema?: unknown }>
}

/**
 * Parse an OpenAPI spec from text (JSON or YAML).
 * Auto-detects format.
 */
export function parseSpec(text: string): OpenApiSpec {
  const trimmed = text.trim()
  let parsed: unknown

  if (trimmed.startsWith('{')) {
    // JSON
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('Failed to parse OpenAPI spec as JSON')
    }
  } else {
    // YAML
    try {
      parsed = parseYaml(trimmed)
    } catch {
      throw new Error('Failed to parse OpenAPI spec as YAML')
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAPI spec must be a JSON/YAML object')
  }

  const spec = parsed as Record<string, unknown>
  if (!spec.openapi || typeof spec.openapi !== 'string') {
    throw new Error('Missing or invalid "openapi" version field in spec')
  }

  if (!spec.openapi.startsWith('3.')) {
    throw new Error(`Unsupported OpenAPI version: ${spec.openapi}. Only 3.x is supported.`)
  }

  return spec as unknown as OpenApiSpec
}
