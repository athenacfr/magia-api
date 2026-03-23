import { describe, it, expect } from "vitest";
import { createAsyncIterableFromSink } from "../ws-shared";

describe("createAsyncIterableFromSink", () => {
  it("yields pushed values in order", async () => {
    const { iterator, push, complete } = createAsyncIterableFromSink<number>();

    push(1);
    push(2);
    push(3);
    complete();

    const results: number[] = [];
    for await (const value of iterator) {
      results.push(value);
    }

    expect(results).toEqual([1, 2, 3]);
  });

  it("waits for values when queue is empty", async () => {
    const { iterator, push, complete } = createAsyncIterableFromSink<string>();

    // Push after a small delay
    setTimeout(() => {
      push("delayed");
      complete();
    }, 10);

    const results: string[] = [];
    for await (const value of iterator) {
      results.push(value);
    }

    expect(results).toEqual(["delayed"]);
  });

  it("propagates errors to consumer", async () => {
    const { iterator, error } = createAsyncIterableFromSink<number>();

    setTimeout(() => {
      error(new Error("connection lost"));
    }, 10);

    await expect(async () => {
      for await (const _ of iterator) {
        // should not reach here
      }
    }).rejects.toThrow("connection lost");
  });

  it("propagates queued errors", async () => {
    const { iterator, push, error } = createAsyncIterableFromSink<number>();

    push(1);
    error(new Error("boom"));

    const iter = iterator[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first).toEqual({ value: 1, done: false });

    await expect(iter.next()).rejects.toThrow("boom");
  });

  it("completes immediately when complete is called before iteration", async () => {
    const { iterator, complete } = createAsyncIterableFromSink<number>();

    complete();

    const results: number[] = [];
    for await (const value of iterator) {
      results.push(value);
    }

    expect(results).toEqual([]);
  });

  it("ignores pushes after complete", async () => {
    const { iterator, push, complete } = createAsyncIterableFromSink<number>();

    push(1);
    complete();
    push(2); // should be ignored

    const results: number[] = [];
    for await (const value of iterator) {
      results.push(value);
    }

    expect(results).toEqual([1]);
  });

  it("ignores pushes after error", async () => {
    const { iterator, push, error } = createAsyncIterableFromSink<number>();

    push(1);
    error(new Error("fail"));
    push(2); // should be ignored

    const iter = iterator[Symbol.asyncIterator]();
    await iter.next(); // gets 1
    await expect(iter.next()).rejects.toThrow("fail");
  });
});
