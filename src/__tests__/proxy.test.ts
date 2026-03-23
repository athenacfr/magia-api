import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMagia } from "../proxy";
import { MagiaError } from "../error";
import type { Manifest } from "../types";

const manifest: Manifest = {
  petstore: {
    plugins: [],
    operations: {
      getPetById: {
        type: "rest",
        method: "GET",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
      listPets: {
        type: "rest",
        method: "GET",
        path: "/pet/findByStatus",
        params: { status: "query" },
      },
      createPet: {
        type: "rest",
        method: "POST",
        path: "/pet",
        params: { body: "body" },
      },
      deletePet: {
        type: "rest",
        method: "DELETE",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
    },
  },
};

const config = {
  apis: {
    petstore: { baseUrl: "https://petstore.example.com" },
  },
};

function mockFetch(data: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(data),
  });
}

describe("createMagia Proxy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("builds correct URL with path params", async () => {
    const fetch = mockFetch({ id: 1, name: "Rex" });
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/1");
    expect(init.method).toBe("GET");
  });

  it("builds correct URL with query params", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.listPets.fetch({ status: "available" });

    const [url] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/findByStatus?status=available");
  });

  it("sends body for POST mutations", async () => {
    const fetch = mockFetch({ id: 2, name: "Buddy" });
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.createPet.fetch({ name: "Buddy", status: "available" });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ name: "Buddy", status: "available" });
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("sends DELETE with path param and no body", async () => {
    const fetch = mockFetch({});
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.deletePet.fetch({ petId: 42 });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/42");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("returns parsed JSON data by default", async () => {
    const fetch = mockFetch({ id: 1, name: "Rex" });
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    const result = await magia.petstore.getPetById.fetch({ petId: 1 });

    expect(result).toEqual({ id: 1, name: "Rex" });
  });

  it("returns raw response when raw: true", async () => {
    const fetch = mockFetch({ id: 1 }, 200);
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    const result = await magia.petstore.getPetById.fetch({ petId: 1 }, { raw: true });

    expect(result).toHaveProperty("data", { id: 1 });
    expect(result).toHaveProperty("status", 200);
    expect(result).toHaveProperty("headers");
  });

  it("throws on unknown API", async () => {
    const magia = createMagia({ ...config, manifest }) as any;
    await expect(magia.unknown.op.fetch({})).rejects.toThrow("Unknown API: unknown");
  });

  it("throws on unknown operation", async () => {
    const magia = createMagia({ ...config, manifest }) as any;
    await expect(magia.petstore.noSuchOp.fetch({})).rejects.toThrow(
      "Unknown operation: petstore.noSuchOp",
    );
  });

  it("throws MagiaError on HTTP error and calls onError", async () => {
    const fetch = mockFetch({}, 404);
    globalThis.fetch = fetch;
    const onError = vi.fn();

    const magia = createMagia({ ...config, manifest, onError }) as any;
    await expect(magia.petstore.getPetById.fetch({ petId: 999 })).rejects.toThrow(MagiaError);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(MagiaError);
  });

  it("passes extra query params from options", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.listPets.fetch({ status: "available" }, { query: { limit: 10 } });

    const [url] = fetch.mock.calls[0];
    expect(url).toContain("status=available");
    expect(url).toContain("limit=10");
  });

  it("passes extra headers from options", async () => {
    const fetch = mockFetch({});
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 }, { headers: { "X-Custom": "value" } });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers["X-Custom"]).toBe("value");
  });

  it("resolves async header functions", async () => {
    const fetch = mockFetch({});
    globalThis.fetch = fetch;

    const asyncConfig = {
      manifest,
      apis: {
        petstore: {
          baseUrl: "https://petstore.example.com",
          fetchOptions: {
            headers: async () => ({ Authorization: "Bearer token123" }),
          },
        },
      },
    };

    const magia = createMagia(asyncConfig) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer token123");
  });

  it("pathKey returns correct tuple on API namespace", () => {
    const magia = createMagia({ ...config, manifest }) as any;
    expect(magia.petstore.pathKey()).toEqual(["magia", "petstore"]);
  });

  it("fetch works with empty input for no-required-param ops", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    await magia.petstore.listPets.fetch();

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/findByStatus");
  });

  it("passes header params from flat input to fetch headers", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const manifestWithHeaders: Manifest = {
      petstore: {
        plugins: [],
        operations: {
          listPets: {
            type: "rest",
            method: "GET",
            path: "/pets",
            params: { "X-Api-Key": "header", status: "query" },
          },
        },
      },
    };

    const magia = createMagia({ ...config, manifest: manifestWithHeaders }) as any;
    await magia.petstore.listPets.fetch({ "X-Api-Key": "my-key", status: "available" });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("status=available");
    expect(url).not.toContain("X-Api-Key");
    expect(init.headers["X-Api-Key"]).toBe("my-key");
  });

  it("does NOT expose TQ methods when plugin not in manifest", () => {
    const magia = createMagia({ ...config, manifest }) as any;
    // manifest has plugins: [] — no TQ
    // .queryOptions recurses into another proxy level instead of returning a TQ function
    // Calling it as a function should throw (it's a proxy, not the TQ queryOptions)
    expect(() => magia.petstore.getPetById.queryOptions({ petId: 1 })).toThrow(
      "Cannot call magia.petstore.getPetById.queryOptions directly",
    );
  });

  it("shorthands() returns per-API proxies", async () => {
    const fetch = mockFetch({ id: 1, name: "Rex" });
    globalThis.fetch = fetch;

    const magia = createMagia({ ...config, manifest }) as any;
    const { petstore } = magia.shorthands();

    const result = await petstore.getPetById.fetch({ petId: 1 });
    expect(result).toEqual({ id: 1, name: "Rex" });

    const [url] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/1");
  });

  it("shorthands() pathKey works on destructured API", () => {
    const magia = createMagia({ ...config, manifest }) as any;
    const { petstore } = magia.shorthands();
    expect(petstore.pathKey()).toEqual(["magia", "petstore"]);
  });

  // ── File upload (multipart) ──

  it("sends FormData for multipart operations", async () => {
    const fetch = mockFetch({ url: "https://example.com/image.png" });
    globalThis.fetch = fetch;

    const multipartManifest: Manifest = {
      petstore: {
        plugins: [],
        operations: {
          uploadImage: {
            type: "rest",
            method: "POST",
            path: "/pet/{petId}/uploadImage",
            params: { petId: "path", body: "body" },
            multipart: true,
          },
        },
      },
    };

    const magia = createMagia({ ...config, manifest: multipartManifest }) as any;
    const file = new File(["image data"], "photo.png", { type: "image/png" });
    await magia.petstore.uploadImage.fetch({ petId: 1, file });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/1/uploadImage");
    expect(init.body).toBeInstanceOf(FormData);
    // Content-Type should NOT be set (let runtime set multipart boundary)
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  // ── SSE / Subscribe ──

  it("subscribe returns AsyncIterable for SSE endpoints", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"id":1}\n\n'));
        controller.enqueue(encoder.encode('data: {"id":2}\n\n'));
        controller.close();
      },
    });

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: stream,
    });
    globalThis.fetch = fetch;

    const sseManifest: Manifest = {
      ai: {
        plugins: [],
        operations: {
          streamChat: {
            type: "rest",
            method: "POST",
            path: "/chat/stream",
            params: { body: "body" },
            sse: true,
          },
        },
      },
    };

    const magia = createMagia({
      manifest: sseManifest,
      apis: { ai: { baseUrl: "https://ai.example.com" } },
    }) as any;

    const events: unknown[] = [];
    for await (const event of magia.ai.streamChat.subscribe({ message: "hello" })) {
      events.push(event);
    }

    expect(events).toEqual([{ id: 1 }, { id: 2 }]);
    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Accept).toBe("text/event-stream");
  });

  it("subscribe throws for non-SSE operations", async () => {
    const magia = createMagia({ ...config, manifest }) as any;
    const iter = magia.petstore.getPetById.subscribe({ petId: 1 });
    const result = iter[Symbol.asyncIterator]().next();
    await expect(result).rejects.toThrow("does not support .subscribe()");
  });

  // ── Lazy manifests ──

  it("works with lazy (async) manifests", async () => {
    const fetch = mockFetch({ id: 1, name: "Rex" });
    globalThis.fetch = fetch;

    const lazyManifest = {
      petstore: async () => manifest.petstore,
    };

    const magia = createMagia({
      manifest: lazyManifest as any,
      apis: config.apis,
    }) as any;

    const pet = await magia.petstore.getPetById.fetch({ petId: 1 });
    expect(pet).toEqual({ id: 1, name: "Rex" });
  });
});
