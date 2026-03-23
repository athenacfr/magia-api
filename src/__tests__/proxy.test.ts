import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMagia } from "../proxy";
import type { Manifest, MagiaConfig } from "../types";

const manifest: Manifest = {
  petstore: {
    plugins: [],
    operations: {
      getPetById: {
        method: "GET",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
      listPets: {
        method: "GET",
        path: "/pet/findByStatus",
        params: { status: "query" },
      },
      createPet: {
        method: "POST",
        path: "/pet",
        params: { body: "body" },
      },
      deletePet: {
        method: "DELETE",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
    },
  },
};

const config: MagiaConfig = {
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

    const magia = createMagia(config, manifest) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/1");
    expect(init.method).toBe("GET");
  });

  it("builds correct URL with query params", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    await magia.petstore.listPets.fetch({ status: "available" });

    const [url] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/findByStatus?status=available");
  });

  it("sends body for POST mutations", async () => {
    const fetch = mockFetch({ id: 2, name: "Buddy" });
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
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

    const magia = createMagia(config, manifest) as any;
    await magia.petstore.deletePet.fetch({ petId: 42 });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://petstore.example.com/pet/42");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });

  it("returns parsed JSON data by default", async () => {
    const fetch = mockFetch({ id: 1, name: "Rex" });
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    const result = await magia.petstore.getPetById.fetch({ petId: 1 });

    expect(result).toEqual({ id: 1, name: "Rex" });
  });

  it("returns raw response when raw: true", async () => {
    const fetch = mockFetch({ id: 1 }, 200);
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    const result = await magia.petstore.getPetById.fetch({ petId: 1 }, { raw: true });

    expect(result).toHaveProperty("data", { id: 1 });
    expect(result).toHaveProperty("status", 200);
    expect(result).toHaveProperty("headers");
  });

  it("throws on unknown API", async () => {
    const magia = createMagia(config, manifest) as any;
    await expect(magia.unknown.op.fetch({})).rejects.toThrow("Unknown API: unknown");
  });

  it("throws on unknown operation", async () => {
    const magia = createMagia(config, manifest) as any;
    await expect(magia.petstore.noSuchOp.fetch({})).rejects.toThrow(
      "Unknown operation: petstore.noSuchOp",
    );
  });

  it("throws on HTTP error and calls onError", async () => {
    const fetch = mockFetch({}, 404);
    globalThis.fetch = fetch;
    const onError = vi.fn();

    const magia = createMagia({ ...config, onError }, manifest) as any;
    await expect(magia.petstore.getPetById.fetch({ petId: 999 })).rejects.toThrow(
      "failed with 404",
    );
    expect(onError).toHaveBeenCalledOnce();
  });

  it("passes extra query params from options", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    await magia.petstore.listPets.fetch({ status: "available" }, { query: { limit: 10 } });

    const [url] = fetch.mock.calls[0];
    expect(url).toContain("status=available");
    expect(url).toContain("limit=10");
  });

  it("passes extra headers from options", async () => {
    const fetch = mockFetch({});
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 }, { headers: { "X-Custom": "value" } });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers["X-Custom"]).toBe("value");
  });

  it("resolves async header functions", async () => {
    const fetch = mockFetch({});
    globalThis.fetch = fetch;

    const asyncConfig: MagiaConfig = {
      apis: {
        petstore: {
          baseUrl: "https://petstore.example.com",
          fetchOptions: {
            headers: async () => ({ Authorization: "Bearer token123" }),
          },
        },
      },
    };

    const magia = createMagia(asyncConfig, manifest) as any;
    await magia.petstore.getPetById.fetch({ petId: 1 });

    const [, init] = fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer token123");
  });

  it("pathKey returns correct tuple on API namespace", () => {
    const magia = createMagia(config, manifest) as any;
    expect(magia.petstore.pathKey()).toEqual(["magia", "petstore"]);
  });

  it("fetch works with empty input for no-required-param ops", async () => {
    const fetch = mockFetch([]);
    globalThis.fetch = fetch;

    const magia = createMagia(config, manifest) as any;
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
            method: "GET",
            path: "/pets",
            params: { "X-Api-Key": "header", status: "query" },
          },
        },
      },
    };

    const magia = createMagia(config, manifestWithHeaders) as any;
    await magia.petstore.listPets.fetch({ "X-Api-Key": "my-key", status: "available" });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("status=available");
    expect(url).not.toContain("X-Api-Key");
    expect(init.headers["X-Api-Key"]).toBe("my-key");
  });

  it("does NOT expose TQ methods when plugin not in manifest", () => {
    const magia = createMagia(config, manifest) as any;
    // manifest has plugins: [] — no TQ
    // .queryOptions recurses into another proxy level instead of returning a TQ function
    // Calling it as a function should throw (it's a proxy, not the TQ queryOptions)
    expect(() => magia.petstore.getPetById.queryOptions({ petId: 1 })).toThrow(
      "Cannot call magia.petstore.getPetById.queryOptions directly",
    );
  });
});
