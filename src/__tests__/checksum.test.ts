import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadChecksums, saveChecksums, hasSchemaChanged, type ChecksumStore } from "../checksum";

describe("checksum", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "magia-checksum-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadChecksums", () => {
    it("returns empty object when no file exists", async () => {
      const store = await loadChecksums(tmpDir);
      expect(store).toEqual({});
    });

    it("loads existing checksums", async () => {
      const data = { petstore: "abc123", users: "def456" };
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "checksums.json"), JSON.stringify(data));

      const store = await loadChecksums(tmpDir);
      expect(store).toEqual(data);
    });
  });

  describe("saveChecksums", () => {
    it("persists checksums to disk", async () => {
      const store: ChecksumStore = { petstore: "abc123" };
      await saveChecksums(tmpDir, store);

      const raw = readFileSync(join(tmpDir, "checksums.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(store);
    });
  });

  describe("hasSchemaChanged", () => {
    it("returns true for new API", () => {
      const store: ChecksumStore = {};
      expect(hasSchemaChanged(store, "petstore", "schema content")).toBe(true);
      expect(store.petstore).toBeDefined();
    });

    it("returns false for unchanged schema", () => {
      const store: ChecksumStore = {};
      hasSchemaChanged(store, "petstore", "schema content");
      expect(hasSchemaChanged(store, "petstore", "schema content")).toBe(false);
    });

    it("returns true when schema changes", () => {
      const store: ChecksumStore = {};
      hasSchemaChanged(store, "petstore", "schema v1");
      expect(hasSchemaChanged(store, "petstore", "schema v2")).toBe(true);
    });

    it("tracks multiple APIs independently", () => {
      const store: ChecksumStore = {};
      hasSchemaChanged(store, "petstore", "schema A");
      hasSchemaChanged(store, "users", "schema B");

      expect(hasSchemaChanged(store, "petstore", "schema A")).toBe(false);
      expect(hasSchemaChanged(store, "users", "schema B changed")).toBe(true);
    });
  });
});
