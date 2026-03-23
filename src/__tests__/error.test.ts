import { describe, it, expect, vi, beforeEach } from "vitest";
import { MagiaError } from "../error";
import { createMagia } from "../proxy";
import type { Manifest } from "../types";

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
        type: "rest",
        method: "GET",
        path: "/pet/{petId}",
        params: { petId: "path" },
      },
      createPet: {
        type: "rest",
        method: "POST",
        path: "/pet",
        params: { body: "body" },
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
  return vi.fn().mockImplementation(async () => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("Proxy error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws MagiaError on 404", async () => {
    globalThis.fetch = mockFetch({ message: "Pet not found" }, 404);
    const magia = createMagia({ ...config, manifest }) as any;

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
    const magia = createMagia({ ...config, manifest }) as any;

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
    const magia = createMagia({ ...config, manifest }) as any;

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

  it("throws MagiaError with ABORTED when user signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort(); // user-initiated abort
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);
    const magia = createMagia({ ...config, manifest }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 }, { signal: controller.signal });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e).toBeInstanceOf(MagiaError);
      expect(e.code).toBe("ABORTED");
      expect(e.isAborted()).toBe(true);
      expect(e.isTimeout()).toBe(false);
    }
  });

  it("throws MagiaError with TIMEOUT when abort has no user signal", async () => {
    const abortErr = new DOMException("The operation was aborted", "AbortError");
    globalThis.fetch = vi.fn().mockRejectedValue(abortErr);
    const magia = createMagia({ ...config, manifest }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e).toBeInstanceOf(MagiaError);
      expect(e.code).toBe("TIMEOUT");
      expect(e.isTimeout()).toBe(true);
      expect(e.isAborted()).toBe(false);
    }
  });

  it("calls onError with MagiaError", async () => {
    globalThis.fetch = mockFetch({}, 403);
    const onError = vi.fn();
    const magia = createMagia({ ...config, manifest, onError }) as any;

    await expect(magia.petstore.getPetById.fetch({ petId: 1 })).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    const err = onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(MagiaError);
    expect(err.isAuthError()).toBe(true);
  });

  it("calls onError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    const onError = vi.fn();
    const magia = createMagia({ ...config, manifest, onError }) as any;

    await expect(magia.petstore.getPetById.fetch({ petId: 1 })).rejects.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(MagiaError);
  });

  it("handles non-JSON error response gracefully", async () => {
    // Return a non-JSON body with 502 status
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response("Bad Gateway", {
        status: 502,
        headers: { "content-type": "text/plain" },
      });
    });
    const magia = createMagia({ ...config, manifest }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 1 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e.status).toBe(502);
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
    const magia = createMagia({ ...config, manifest }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      expect(magia.petstore.getPetById.isError(err, 404)).toBe(true);
      expect(magia.petstore.getPetById.isError(err, 500)).toBe(false);
    }
  });

  it("returns false for non-MagiaError", () => {
    const magia = createMagia({ ...config, manifest }) as any;
    expect(magia.petstore.getPetById.isError(new Error("nope"), 404)).toBe(false);
    expect(magia.petstore.getPetById.isError(null, 404)).toBe(false);
    expect(magia.petstore.getPetById.isError("string", 404)).toBe(false);
  });

  it("returns false for wrong API/operation", async () => {
    globalThis.fetch = mockFetch({}, 404);
    const magia = createMagia({ ...config, manifest }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      // Error is from petstore.getPetById, not createPet
      expect(magia.petstore.createPet.isError(err, 404)).toBe(false);
    }
  });

  it("works with string codes", () => {
    const magia = createMagia({ ...config, manifest }) as any;
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

// ---------------------------------------------------------------------------
// safeFetch tests
// ---------------------------------------------------------------------------

describe("safeFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { data, error: undefined } on success", async () => {
    globalThis.fetch = mockFetch({ id: 1, name: "Rex" });
    const magia = createMagia({ ...config, manifest }) as any;

    const result = await magia.petstore.getPetById.safeFetch({ petId: 1 });
    expect(result.data).toEqual({ id: 1, name: "Rex" });
    expect(result.error).toBeUndefined();
  });

  it("returns { data: undefined, error } on HTTP error", async () => {
    globalThis.fetch = mockFetch({ message: "not found" }, 404);
    const magia = createMagia({ ...config, manifest }) as any;

    const result = await magia.petstore.getPetById.safeFetch({ petId: 999 });
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(MagiaError);
    expect(result.error.status).toBe(404);
    expect(result.error.isNotFound()).toBe(true);
  });

  it("returns { data: undefined, error } on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const magia = createMagia({ ...config, manifest }) as any;

    const result = await magia.petstore.getPetById.safeFetch({ petId: 1 });
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(MagiaError);
    expect(result.error.isNetworkError()).toBe(true);
  });

  it("still calls onError callback", async () => {
    globalThis.fetch = mockFetch({}, 500);
    const onError = vi.fn();
    const magia = createMagia({ ...config, manifest, onError }) as any;

    const result = await magia.petstore.getPetById.safeFetch({ petId: 1 });
    expect(result.error).toBeInstanceOf(MagiaError);
    expect(onError).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// transformError tests
// ---------------------------------------------------------------------------

describe("transformError", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("transforms error before throwing", async () => {
    globalThis.fetch = mockFetch({}, 404);
    const transformError = vi.fn((err: MagiaError) => {
      return new MagiaError(`Custom: ${err.message}`, {
        status: err.status,
        code: "CUSTOM_NOT_FOUND",
        api: err.api,
        operation: err.operation,
        data: err.data,
        response: err.response,
      });
    });

    const magia = createMagia({ ...config, manifest, transformError }) as any;

    try {
      await magia.petstore.getPetById.fetch({ petId: 999 });
      expect.fail("should have thrown");
    } catch (err) {
      const e = err as MagiaError;
      expect(e.code).toBe("CUSTOM_NOT_FOUND");
      expect(e.message).toContain("Custom:");
    }

    expect(transformError).toHaveBeenCalledOnce();
  });

  it("transformed error is passed to onError", async () => {
    globalThis.fetch = mockFetch({}, 500);
    const onError = vi.fn();
    const transformError = (err: MagiaError) =>
      new MagiaError("transformed", {
        status: err.status,
        code: "TRANSFORMED",
        api: err.api,
        operation: err.operation,
        data: err.data,
      });

    const magia = createMagia({ ...config, manifest, transformError, onError }) as any;
    await expect(magia.petstore.getPetById.fetch({ petId: 1 })).rejects.toThrow();

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].code).toBe("TRANSFORMED");
  });

  it("transformError works with safeFetch", async () => {
    globalThis.fetch = mockFetch({}, 403);
    const transformError = (err: MagiaError) =>
      new MagiaError("auth failed", {
        status: err.status,
        code: "AUTH_FAILED",
        api: err.api,
        operation: err.operation,
        data: err.data,
      });

    const magia = createMagia({ ...config, manifest, transformError }) as any;
    const result = await magia.petstore.getPetById.safeFetch({ petId: 1 });

    expect(result.error).toBeInstanceOf(MagiaError);
    expect(result.error.code).toBe("AUTH_FAILED");
  });
});
