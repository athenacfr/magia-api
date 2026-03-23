import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  classifySource,
  isLocalUrl,
  getSchemaEnvOverride,
  resolveSchema,
  getSchemaDefaults,
} from "../schema";

describe("classifySource", () => {
  it("classifies HTTPS URL", () => {
    expect(classifySource("https://example.com/spec.json")).toBe("url");
  });

  it("classifies HTTP URL", () => {
    expect(classifySource("http://localhost:3000/spec")).toBe("url");
  });

  it("classifies local file path", () => {
    expect(classifySource("./schemas/spec.json")).toBe("local-file");
    expect(classifySource("/absolute/path/spec.yaml")).toBe("local-file");
    expect(classifySource("schemas/spec.graphql")).toBe("local-file");
  });

  it("classifies async function", () => {
    expect(classifySource(async () => "{}")).toBe("async-fn");
  });

  it("classifies script object", () => {
    expect(classifySource({ command: "./fetch.sh", output: "./out.json" })).toBe("script");
  });
});

describe("isLocalUrl", () => {
  it("detects localhost", () => {
    expect(isLocalUrl("http://localhost:3000/api")).toBe(true);
    expect(isLocalUrl("https://localhost/spec")).toBe(true);
  });

  it("detects 127.x.x.x", () => {
    expect(isLocalUrl("http://127.0.0.1:8080/spec")).toBe(true);
  });

  it("detects 10.x.x.x", () => {
    expect(isLocalUrl("http://10.0.1.5/api/spec")).toBe(true);
  });

  it("detects 192.168.x.x", () => {
    expect(isLocalUrl("http://192.168.1.100/spec")).toBe(true);
  });

  it("rejects remote URLs", () => {
    expect(isLocalUrl("https://api.example.com/spec")).toBe(false);
    expect(isLocalUrl("https://petstore.swagger.io/v3/openapi.json")).toBe(false);
  });
});

describe("getSchemaEnvOverride", () => {
  afterEach(() => {
    delete process.env.MAGIA_PETSTORE_SCHEMA;
    delete process.env.MAGIA_GITHUB_SCHEMA;
  });

  it("returns env var value when set", () => {
    process.env.MAGIA_PETSTORE_SCHEMA = "./frozen/petstore.json";
    expect(getSchemaEnvOverride("petstore")).toBe("./frozen/petstore.json");
  });

  it("uppercases the API name", () => {
    process.env.MAGIA_GITHUB_SCHEMA = "./frozen/github.graphql";
    expect(getSchemaEnvOverride("github")).toBe("./frozen/github.graphql");
  });

  it("returns null when not set", () => {
    expect(getSchemaEnvOverride("petstore")).toBeNull();
  });
});

describe("resolveSchema", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-schema-"));
    vi.restoreAllMocks();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.MAGIA_PETSTORE_SCHEMA;
  });

  it("reads local file", async () => {
    writeFileSync(join(tmpDir, "spec.json"), '{"openapi":"3.0.0"}');

    const result = await resolveSchema({
      apiName: "test",
      source: "./spec.json",
      cwd: tmpDir,
    });

    expect(result).toBe('{"openapi":"3.0.0"}');
  });

  it("reads absolute file path", async () => {
    const filePath = join(tmpDir, "spec.json");
    writeFileSync(filePath, '{"openapi":"3.1.0"}');

    const result = await resolveSchema({
      apiName: "test",
      source: filePath,
      cwd: tmpDir,
    });

    expect(result).toBe('{"openapi":"3.1.0"}');
  });

  it("throws on missing local file", async () => {
    await expect(
      resolveSchema({ apiName: "test", source: "./missing.json", cwd: tmpDir }),
    ).rejects.toThrow("Failed to read schema file");
  });

  it("calls async function source", async () => {
    const result = await resolveSchema({
      apiName: "test",
      source: async () => '{"openapi":"3.0.0","from":"async"}',
    });

    expect(result).toBe('{"openapi":"3.0.0","from":"async"}');
  });

  it("runs script and reads output", async () => {
    const outputPath = join(tmpDir, "output.json");
    // Script that creates the output file
    const command = `echo '{"openapi":"3.0.0"}' > ${outputPath}`;

    const result = await resolveSchema({
      apiName: "test",
      source: { command, output: outputPath },
      cwd: tmpDir,
    });

    expect(result.trim()).toBe('{"openapi":"3.0.0"}');
  });

  it("throws when script fails", async () => {
    await expect(
      resolveSchema({
        apiName: "test",
        source: { command: "exit 1", output: "./out.json" },
        cwd: tmpDir,
      }),
    ).rejects.toThrow("Schema script failed");
  });

  it("throws when script output file missing", async () => {
    await expect(
      resolveSchema({
        apiName: "test",
        source: { command: "echo hello", output: "./nonexistent.json" },
        cwd: tmpDir,
      }),
    ).rejects.toThrow("output file not found");
  });

  it("fetches from URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('{"openapi":"3.0.0"}'),
    });
    globalThis.fetch = mockFetch;

    const result = await resolveSchema({
      apiName: "test",
      source: "https://example.com/spec.json",
    });

    expect(result).toBe('{"openapi":"3.0.0"}');
    expect(mockFetch).toHaveBeenCalledWith("https://example.com/spec.json");
  });

  it("throws on URL fetch failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(
      resolveSchema({ apiName: "test", source: "https://example.com/spec.json" }),
    ).rejects.toThrow("Failed to fetch schema from");
  });

  it("uses env var override over configured source", async () => {
    writeFileSync(join(tmpDir, "frozen.json"), '{"from":"env-override"}');
    process.env.MAGIA_PETSTORE_SCHEMA = join(tmpDir, "frozen.json");

    const result = await resolveSchema({
      apiName: "petstore",
      source: "https://remote.api/spec.json", // would fail if actually called
      cwd: tmpDir,
    });

    expect(result).toBe('{"from":"env-override"}');
  });
});

describe("getSchemaDefaults", () => {
  it("local file: watch=true, cache=disabled", () => {
    expect(getSchemaDefaults("./spec.json")).toEqual({
      watch: true,
      cache: "disabled",
    });
  });

  it("localhost URL: watch=true, cache=disabled", () => {
    expect(getSchemaDefaults("http://localhost:3000/spec")).toEqual({
      watch: true,
      cache: "disabled",
    });
  });

  it("127.0.0.1 URL: watch=true, cache=disabled", () => {
    expect(getSchemaDefaults("http://127.0.0.1:8080/spec")).toEqual({
      watch: true,
      cache: "disabled",
    });
  });

  it("remote URL: watch=false, cache=1h", () => {
    expect(getSchemaDefaults("https://api.example.com/spec")).toEqual({
      watch: false,
      cache: { ttl: "1h" },
    });
  });

  it("async function: watch=false, cache=1h", () => {
    expect(getSchemaDefaults(async () => "{}")).toEqual({
      watch: false,
      cache: { ttl: "1h" },
    });
  });

  it("script: watch=false, cache=1h", () => {
    expect(getSchemaDefaults({ command: "./fetch.sh", output: "./out.json" })).toEqual({
      watch: false,
      cache: { ttl: "1h" },
    });
  });
});
