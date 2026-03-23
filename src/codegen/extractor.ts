import type { OpenApiSpec, OpenApiOperation, OpenApiParameter, OpenApiPathItem } from "./parser";
import type { RestManifestEntry, ParamLocation, PaginationMeta } from "../types";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

export interface ExtractedOperation {
  operationName: string;
  entry: RestManifestEntry;
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
    if (param.in === "path" || param.in === "query" || param.in === "header") {
      params[param.name] = param.in;
    }
  }

  // Operation-level parameters (override path-level)
  for (const param of operation.parameters ?? []) {
    if (param.in === "path" || param.in === "query" || param.in === "header") {
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
 * Detect if requestBody uses multipart/form-data.
 */
function isMultipart(operation: OpenApiOperation): boolean {
  return !!operation.requestBody?.content?.["multipart/form-data"];
}

/**
 * Detect if any success response uses text/event-stream (SSE).
 */
function isSSE(operation: OpenApiOperation): boolean {
  for (const [code, response] of Object.entries(operation.responses ?? {})) {
    if (code.startsWith("2") && response.content?.["text/event-stream"]) {
      return true;
    }
  }
  return false;
}

/**
 * Detect pagination params from query parameters.
 */
function detectPagination(params: Record<string, ParamLocation>): PaginationMeta | undefined {
  const queryParams = new Set(
    Object.entries(params)
      .filter(([, loc]) => loc === "query")
      .map(([name]) => name.toLowerCase()),
  );

  const queryParamNames = Object.entries(params)
    .filter(([, loc]) => loc === "query")
    .map(([name]) => name);

  // cursor-based: cursor or after param
  for (const name of queryParamNames) {
    const lower = name.toLowerCase();
    if (lower === "cursor" || (lower === "after" && !queryParams.has("before"))) {
      return { style: "cursor", pageParam: name };
    }
  }

  // offset/limit
  if (queryParams.has("offset") && queryParams.has("limit")) {
    const offsetName = queryParamNames.find((n) => n.toLowerCase() === "offset")!;
    const limitName = queryParamNames.find((n) => n.toLowerCase() === "limit")!;
    return { style: "offset", pageParam: offsetName, sizeParam: limitName };
  }

  // page/pageSize
  for (const name of queryParamNames) {
    const lower = name.toLowerCase();
    if (lower === "page") {
      const sizeName = queryParamNames.find((n) =>
        ["pagesize", "per_page", "perpage", "limit", "size"].includes(n.toLowerCase()),
      );
      return { style: "page", pageParam: name, sizeParam: sizeName };
    }
  }

  return undefined;
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
      const params = extractParams(pathParams, operation);
      const multipart = isMultipart(operation) || undefined;
      const sse = isSSE(operation) || undefined;
      const pagination = detectPagination(params);

      operations.push({
        operationName,
        entry: {
          type: "rest",
          method: method.toUpperCase() as RestManifestEntry["method"],
          path,
          params,
          ...(multipart && { multipart }),
          ...(sse && { sse }),
          ...(pagination && { pagination }),
        },
      });
    }
  }

  return operations;
}
