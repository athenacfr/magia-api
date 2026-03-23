import type { OpenApiSpec, OpenApiOperation, OpenApiParameter, OpenApiPathItem } from "./parser";
import type { ManifestEntry, ParamLocation } from "../types";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ExtractedOperation {
  operationName: string;
  entry: ManifestEntry;
}

export interface ExtractOptions {
  /** Custom operation naming function */
  operationName?: (method: string, path: string, operationId?: string) => string;
}

/**
 * Default operation name: use operationId, fallback to method + path slug.
 * e.g. GET /pet/{petId} → getPetPetId
 */
function defaultOperationName(method: string, path: string, operationId?: string): string {
  if (operationId) return operationId;

  // Fallback: GET /pet/{petId} → get_pet_petId → getPetPetId
  const slug = path
    .replace(/\{(\w+)\}/g, "$1") // {petId} → petId
    .replace(/[^a-zA-Z0-9]/g, "_") // non-alphanum → _
    .replace(/_+/g, "_") // collapse
    .replace(/^_|_$/g, ""); // trim

  const parts = slug.split("_").filter(Boolean);
  const camel = parts
    .map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase()))
    .join("");

  return method.toLowerCase() + camel[0].toUpperCase() + camel.slice(1);
}

/**
 * Extract parameter locations from an operation.
 * Merges path-level and operation-level parameters.
 */
function extractParams(
  pathParams: OpenApiParameter[],
  operation: OpenApiOperation,
): Record<string, ParamLocation> {
  const params: Record<string, ParamLocation> = {};

  // Path-level parameters
  for (const param of pathParams) {
    if (param.in === "path" || param.in === "query") {
      params[param.name] = param.in;
    }
  }

  // Operation-level parameters (override path-level)
  for (const param of operation.parameters ?? []) {
    if (param.in === "path" || param.in === "query") {
      params[param.name] = param.in;
    }
  }

  // Request body → 'body' param
  if (operation.requestBody) {
    params["body"] = "body";
  }

  return params;
}

/**
 * Extract all operations from an OpenAPI spec.
 */
export function extractOperations(
  spec: OpenApiSpec,
  opts: ExtractOptions = {},
): ExtractedOperation[] {
  const operations: ExtractedOperation[] = [];
  const nameFn = opts.operationName ?? defaultOperationName;

  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const pathParams = pathItem.parameters ?? [];

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const operationName = nameFn(method.toUpperCase(), path, operation.operationId);

      operations.push({
        operationName,
        entry: {
          method: method.toUpperCase() as ManifestEntry["method"],
          path,
          params: extractParams(pathParams, operation),
        },
      });
    }
  }

  return operations;
}
