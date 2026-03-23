// ---------------------------------------------------------------------------
// Push → Pull bridge: callback-based WebSocket events → AsyncIterable
// ---------------------------------------------------------------------------

export interface AsyncIterableSink<T> {
  iterator: AsyncIterable<T>;
  push: (value: T) => void;
  error: (err: Error) => void;
  complete: () => void;
}

/**
 * Creates a bridge between push-based callbacks (WebSocket onMessage)
 * and pull-based AsyncIterable (for await...of).
 *
 * - push(value): resolves a waiting consumer or queues the value
 * - error(err): rejects the current or next consumer
 * - complete(): signals the iterator is done
 */
export function createAsyncIterableFromSink<T>(): AsyncIterableSink<T> {
  const queue: T[] = [];
  let done = false;
  let pendingError: Error | null = null;

  // Resolver for a consumer waiting for the next value
  let resolve: ((result: IteratorResult<T>) => void) | null = null;
  let reject: ((err: Error) => void) | null = null;

  function push(value: T): void {
    if (done) return;
    if (resolve) {
      const r = resolve;
      resolve = null;
      reject = null;
      r({ value, done: false });
    } else {
      queue.push(value);
    }
  }

  function error(err: Error): void {
    if (done) return;
    if (reject) {
      const r = reject;
      resolve = null;
      reject = null;
      r(err);
    } else {
      pendingError = err;
    }
    done = true;
  }

  function complete(): void {
    if (done) return;
    done = true;
    if (resolve) {
      const r = resolve;
      resolve = null;
      reject = null;
      r({ value: undefined as T, done: true });
    }
  }

  function next(): Promise<IteratorResult<T>> {
    if (queue.length > 0) {
      return Promise.resolve({ value: queue.shift()!, done: false });
    }
    if (pendingError) {
      const err = pendingError;
      pendingError = null;
      return Promise.reject(err);
    }
    if (done) {
      return Promise.resolve({ value: undefined as T, done: true });
    }
    return new Promise<IteratorResult<T>>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  }

  const iterator: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next,
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    },
  };

  return { iterator, push, error, complete };
}
