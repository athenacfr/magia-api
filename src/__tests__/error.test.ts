import { describe, it, expect, vi, beforeEach } from "vitest";
import { MagiaError } from "../error";
import { createMagia } from "../proxy";
import type { Manifest, MagiaConfig } from "../types";

// ---------------------------------------------------------------------------
// MagiaError class tests
// ---------------------------------------------------------------------------

describe("MagiaError", () => {
  it("is an instance of Error", () => {
    const err = new MagiaError("test", {
      status: 404,
      code: "404",
      api: "petstore",
      operation: "getPetById",
      data: { message: "not found" },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MagiaError);
    expect(err.name).toBe("MagiaError");
    expect(err.message).toBe("test");
  });

  it("stores all properties", () => {
    const err = new MagiaError("test", {
      status: 422,
      code: "422",
      api: "petstore",
      operation: "addPet",
      data: { fields: ["name"] },
    });
    expect(err.status).toBe(422);
    expect(err.code).toBe("422");
    expect(err.api).toBe("petstore");
    expect(err.operation).toBe("addPet");
    expect(err.data).toEqual({ fields: ["name"] });
  });

  it("isValidationError for 400", () => {
    const err = new MagiaError("bad", {
      status: 400,
      code: "400",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isValidationError()).toBe(true);
    expect(err.isAuthError()).toBe(false);
    expect(err.isNotFound()).toBe(false);
    expect(err.isServerError()).toBe(false);
  });

  it("isValidationError for 422", () => {
    const err = new MagiaError("bad", {
      status: 422,
      code: "422",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isValidationError()).toBe(true);
  });

  it("isAuthError for 401", () => {
    const err = new MagiaError("unauth", {
      status: 401,
      code: "401",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isAuthError()).toBe(true);
  });

  it("isAuthError for 403", () => {
    const err = new MagiaError("forbidden", {
      status: 403,
      code: "403",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isAuthError()).toBe(true);
  });

  it("isNotFound for 404", () => {
    const err = new MagiaError("nf", {
      status: 404,
      code: "404",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isNotFound()).toBe(true);
  });

  it("isServerError for 500", () => {
    const err = new MagiaError("ise", {
      status: 500,
      code: "500",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isServerError()).toBe(true);
  });

  it("isServerError for 503", () => {
    const err = new MagiaError("unavail", {
      status: 503,
      code: "503",
      api: "a",
      operation: "b",
      data: null,
    });
    expect(err.isServerError()).toBe(true);
  });

  it("isNetworkError", () => {
    const err = new MagiaError("offline", {
      status: 0,
      code: "NETWORK_ERROR",
      api: "a",
      operation: "b",
      data: undefined,
    });
    expect(err.isNetworkError()).toBe(true);
    expect(err.isTimeout()).toBe(false);
  });

  it("isTimeout", () => {
    const err = new MagiaError("aborted", {
      status: 0,
      code: "TIMEOUT",
      api: "a",
      operation: "b",
      data: undefined,
    });
    expect(err.isTimeout()).toBe(true);
    expect(err.isNetworkError()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Proxy error handling tests
// ---------------------------------------------------------------------------

const manifest: Manifest = {
  petstore: {
    plugins: [],
    operations: {
      getPetById: {
        method: "GET",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
      createPet: {
        method: "POST",
        path: "/pet",
        params: { body: "body" },
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

describe("Proxy error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws MagiaError on 404", async () => {
    globalThis.fetch = mockFetch({ message: "Pet not found" }, 404);
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MagiaError);
      const e = err as MagiaError;
      expect(e.status).toBe(404);
      expect(e.code).toBe("404");
      expect(e.api).toBe("petstore");
      expect(e.operation).toBe("getPetById");
      expect(e.data).toEqual({ message: "Pet not found" });
      expect(e.isNotFound()).toBe(true);
      expect(e.response).toBeDefined();
    }
  });

  it("throws MagiaError on 500 with error data", async () => {
    globalThis.fetch = mockFetch({ error: "internal" }, 500);
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e.status).toBe(500);
      expect(e.isServerError()).toBe(true);
      expect(e.data).toEqual({ error: "internal" });
    }
  });

  it("throws MagiaError with NETWORK_ERROR on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e).toBeInstanceOf(MagiaError);
      expect(e.status).toBe(0);
      expect(e.code).toBe("NETWORK_ERROR");
      expect(e.isNetworkError()).toBe(true);
      expect(e.api).toBe("petstore");
      expect(e.operation).toBe("getPetById");
    }
  });

  it("throws MagiaError with TIMEOUT on abort", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e).toBeInstanceOf(MagiaError);
      expect(e.code).toBe("TIMEOUT");
      expect(e.isTimeout()).toBe(true);
    }
  });

  it("calls onError with MagiaError", async () => {
    globalThis.fetch = mockFetch({}, 403);
    const onError = vi.fn();
    const magia = createMagia({ ...config, onError }, manifest) as any;

    await expect(magia.petstore.getPetById.fetch({ petId: 1 })).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    const err = onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(MagiaError);
    expect(err.isAuthError()).toBe(true);
  });

  it("calls onError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    const onError = vi.fn();
    const magia = createMagia({ ...config, onError }, manifest) as any;

    await expect(magia.petstore.getPetById.fetch({ petId: 1 })).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(MagiaError);
  });

  it("handles non-JSON error response gracefully", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: () => Promise.reject(new SyntaxError("Unexpected token")),
    });
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e.status).toBe(502);
      expect(e.data).toBeUndefined();
      expect(e.isServerError()).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// isError type guard tests
// ---------------------------------------------------------------------------

describe("isError type guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns true for matching MagiaError", async () => {
    globalThis.fetch = mockFetch({ message: "not found" }, 404);
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(magia.petstore.getPetById.isError(err, 404)).toBe(true);
      expect(magia.petstore.getPetById.isError(err, 500)).toBe(false);
    }
  });

  it("returns false for non-MagiaError", () => {
    const magia = createMagia(config, manifest) as any;
    expect(magia.petstore.getPetById.isError(new Error("nope"), 404)).toBe(false);
    expect(magia.petstore.getPetById.isError(null, 404)).toBe(false);
    expect(magia.petstore.getPetById.isError("string", 404)).toBe(false);
  });

  it("returns false for wrong API/operation", async () => {
    globalThis.fetch = mockFetch({}, 404);
    const magia = createMagia(config, manifest) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      // Error is from petstore.getPetById, not createPet
      expect(magia.petstore.createPet.isError(err, 404)).toBe(false);
    }
  });

  it("works with string codes", () => {
    const magia = createMagia(config, manifest) as any;
    const err = new MagiaError("timeout", {
      status: 0,
      code: "TIMEOUT",
      api: "petstore",
      operation: "getPetById",
      data: undefined,
    });
    expect(magia.petstore.getPetById.isError(err, "TIMEOUT")).toBe(true);
    expect(magia.petstore.getPetById.isError(err, "NETWORK_ERROR")).toBe(false);
  });
});
