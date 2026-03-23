import { MagiaError } from "./error";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Static response, error, or function that computes a response from input */
export type MockResponse<T = unknown> =
  | { data: T }
  | { error: { status: number; data?: unknown; message?: string } }
  | { events: T[] }
  | ((input: Record<string, unknown>) => T);

export type MockOperations = Record<string, MockResponse>;
export type MockApis = Record<string, MockOperations>;

// ---------------------------------------------------------------------------
// createTestMagia — full mock client
// ---------------------------------------------------------------------------

/**
 * Create a fully mocked magia client for testing.
 * No network calls — all operations return static or computed responses.
 *
 * @example
 * ```ts
 * const magia = createTestMagia({
 *   petstore: {
 *     getPetById: { data: { id: 1, name: 'Rex' } },
 *     createPet: { data: { id: 2, name: 'Buddy' } },
 *     deletePet: { error: { status: 404, data: { message: 'not found' } } },
 *   },
 * })
 *
 * const pet = await magia.petstore.getPetById.fetch({ petId: 1 })
 * // → { id: 1, name: 'Rex' }
 * ```
 */
export function createTestMagia(mocks: MockApis): any {
  return createTestProxy(mocks, []);
}

function resolveTestMock(
  mock: MockResponse,
  input: Record<string, unknown>,
  apiName: string,
  operationName: string,
): unknown {
  if (typeof mock === "function") {
    return mock(input);
  }

  if ("error" in mock) {
    throw new MagiaError(mock.error.message ?? `Mock error ${mock.error.status}`, {
      status: mock.error.status,
      code: String(mock.error.status),
      api: apiName,
      operation: operationName,
      data: mock.error.data,
    });
  }

  if ("events" in mock) {
    // .subscribe() mock used with .fetch() — return first event
    return mock.events[0];
  }

  return (mock as { data: unknown }).data;
}

function createTestProxy(mocks: MockApis, path: string[]): unknown {
  return new Proxy(() => {}, {
    get(_target, prop: string) {
      if (prop === "then") return undefined;

      // .fetch() on operation level
      if (prop === "fetch" && path.length === 2) {
        const [apiName, operationName] = path;
        const mock = mocks[apiName]?.[operationName];
        if (!mock) {
          return () => {
            throw new Error(
              `No mock defined for ${apiName}.${operationName}. ` +
                `Add it to createTestMagia({ ${apiName}: { ${operationName}: { data: ... } } })`,
            );
          };
        }
        return (input: Record<string, unknown> = {}) =>
          Promise.resolve().then(() => resolveTestMock(mock, input, apiName, operationName));
      }

      // .isError() on operation level
      if (prop === "isError" && path.length === 2) {
        return (error: unknown, code: number | string): error is MagiaError =>
          error instanceof MagiaError &&
          error.api === path[0] &&
          error.operation === path[1] &&
          (typeof code === "number" ? error.status === code : error.code === code);
      }

      // .pathKey() on API level
      if (prop === "pathKey" && path.length === 1) {
        return () => ["magia", path[0]] as const;
      }

      // .queryOptions()
      if (prop === "queryOptions" && path.length === 2) {
        const [apiName, operationName] = path;
        const mock = mocks[apiName]?.[operationName];
        return (input: Record<string, unknown> = {}) => ({
          queryKey:
            Object.keys(input).length > 0
              ? (["magia", apiName, operationName, input] as const)
              : (["magia", apiName, operationName] as const),
          queryFn: () =>
            Promise.resolve().then(() =>
              mock ? resolveTestMock(mock, input, apiName, operationName) : undefined,
            ),
        });
      }

      // .queryKey()
      if (prop === "queryKey" && path.length === 2) {
        const [apiName, operationName] = path;
        return (input?: Record<string, unknown>) =>
          input != null
            ? (["magia", apiName, operationName, input] as const)
            : (["magia", apiName, operationName] as const);
      }

      // .mutationOptions()
      if (prop === "mutationOptions" && path.length === 2) {
        const [apiName, operationName] = path;
        const mock = mocks[apiName]?.[operationName];
        return (opts?: Record<string, unknown>) => ({
          mutationFn: (input: Record<string, unknown>) =>
            Promise.resolve().then(() =>
              mock ? resolveTestMock(mock, input, apiName, operationName) : undefined,
            ),
          mutationKey: ["magia", apiName, operationName] as const,
          ...opts,
        });
      }

      // .mutationKey()
      if (prop === "mutationKey" && path.length === 2) {
        const [apiName, operationName] = path;
        return () => ["magia", apiName, operationName] as const;
      }

      // .subscribe() on operation level — returns AsyncIterable from events array
      if (prop === "subscribe" && path.length === 2) {
        const [apiName, operationName] = path;
        const mock = mocks[apiName]?.[operationName];
        return (input: Record<string, unknown> = {}) => {
          if (!mock) {
            throw new Error(
              `No mock defined for ${apiName}.${operationName}. ` +
                `Add it to createTestMagia({ ${apiName}: { ${operationName}: { events: [...] } } })`,
            );
          }
          if (typeof mock === "object" && "events" in mock) {
            return (async function* () {
              for (const event of mock.events) {
                yield event;
              }
            })();
          }
          throw new Error(
            `Mock for ${apiName}.${operationName} does not have 'events' array for .subscribe()`,
          );
        };
      }

      // .infiniteQueryOptions()
      if (prop === "infiniteQueryOptions" && path.length === 2) {
        const [apiName, operationName] = path;
        const mock = mocks[apiName]?.[operationName];
        return (
          input: Record<string, unknown> = {},
          opts?: { getNextPageParam?: (lastPage: unknown) => unknown },
        ) => ({
          queryKey:
            Object.keys(input).length > 0
              ? (["magia", apiName, operationName, input] as const)
              : (["magia", apiName, operationName] as const),
          queryFn: () =>
            Promise.resolve().then(() =>
              mock ? resolveTestMock(mock, input, apiName, operationName) : undefined,
            ),
          initialPageParam: undefined,
          ...(opts?.getNextPageParam ? { getNextPageParam: opts.getNextPageParam } : {}),
        });
      }

      return createTestProxy(mocks, [...path, prop]);
    },

    apply() {
      throw new Error(`Cannot call magia.${path.join(".")} directly — use .fetch()`);
    },
  });
}
