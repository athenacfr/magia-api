import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadChecksums,
  saveChecksums,
  hasSchemaChanged,
  diffOperations,
  type ChecksumStore,
} from "../checksum";

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
      const data = {
        petstore: { hash: "abc123", operations: ["getPetById"] },
        users: { hash: "def456", operations: ["getUser"] },
      };
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "checksums.json"), JSON.stringify(data));

      const store = await loadChecksums(tmpDir);
      expect(store).toEqual(data);
    });

    it("migrates old format (plain hash strings)", async () => {
      const oldData = { petstore: "abc123" };
      const { writeFileSync, mkdirSync } = await import("node:fs");
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "checksums.json"), JSON.stringify(oldData));

      const store = await loadChecksums(tmpDir);
      expect(store.petstore.hash).toBe("abc123");
      expect(store.petstore.operations).toEqual([]);
    });
  });

  describe("saveChecksums", () => {
    it("persists checksums to disk", async () => {
      const store: ChecksumStore = { petstore: { hash: "abc123", operations: ["getPetById"] } };
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

  describe("diffOperations", () => {
    it("detects added operations", () => {
      const store: ChecksumStore = {
        petstore: { hash: "abc", operations: ["getPetById"] },
      };
      const diff = diffOperations(store, "petstore", ["getPetById", "addPet"]);
      expect(diff.added).toEqual(["addPet"]);
      expect(diff.removed).toEqual([]);
    });

    it("detects removed operations", () => {
      const store: ChecksumStore = {
        petstore: { hash: "abc", operations: ["getPetById", "deletePet"] },
      };
      const diff = diffOperations(store, "petstore", ["getPetById"]);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual(["deletePet"]);
    });

    it("detects both added and removed", () => {
      const store: ChecksumStore = {
        petstore: { hash: "abc", operations: ["getPetById", "deletePet"] },
      };
      const diff = diffOperations(store, "petstore", ["getPetById", "updatePet"]);
      expect(diff.added).toEqual(["updatePet"]);
      expect(diff.removed).toEqual(["deletePet"]);
    });

    it("returns empty diff when no changes", () => {
      const store: ChecksumStore = {
        petstore: { hash: "abc", operations: ["getPetById", "addPet"] },
      };
      const diff = diffOperations(store, "petstore", ["getPetById", "addPet"]);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    });

    it("handles new API with no previous operations", () => {
      const store: ChecksumStore = {};
      hasSchemaChanged(store, "petstore", "schema");
      const diff = diffOperations(store, "petstore", ["getPetById", "addPet"]);
      expect(diff.added).toEqual(["getPetById", "addPet"]);
      expect(diff.removed).toEqual([]);
    });

    it("updates store with current operations", () => {
      const store: ChecksumStore = {
        petstore: { hash: "abc", operations: ["getPetById"] },
      };
      diffOperations(store, "petstore", ["getPetById", "addPet"]);
      expect(store.petstore.operations).toEqual(["getPetById", "addPet"]);
    });
  });
});
