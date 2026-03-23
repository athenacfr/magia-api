import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export interface ApiChecksum {
  hash: string;
  operations: string[];
}

export interface ChecksumStore {
  [apiName: string]: ApiChecksum;
}

export interface OperationDiff {
  added: string[];
  removed: string[];
}

function hashSchema(schemaText: string): string {
  return createHash("sha256").update(schemaText).digest("hex");
}

function checksumPath(outputDir: string): string {
  return resolve(outputDir, "checksums.json");
}

export async function loadChecksums(outputDir: string): Promise<ChecksumStore> {
  try {
    const raw = await readFile(checksumPath(outputDir), "utf-8");
    const parsed = JSON.parse(raw);
    // Migrate old format (plain hash strings) to new format
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === "string") {
        parsed[key] = { hash: val, operations: [] };
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function saveChecksums(outputDir: string, store: ChecksumStore): Promise<void> {
  const filePath = checksumPath(outputDir);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Returns true if the schema has changed (or no previous checksum exists).
 * Updates the store in-place with the new hash.
 */
export function hasSchemaChanged(
  store: ChecksumStore,
  apiName: string,
  schemaText: string,
): boolean {
  const newHash = hashSchema(schemaText);
  const oldHash = store[apiName]?.hash;
  if (!store[apiName]) {
    store[apiName] = { hash: newHash, operations: [] };
  } else {
    store[apiName].hash = newHash;
  }
  return oldHash !== newHash;
}

/**
 * Compare previous operations with current and return diff.
 * Updates the store in-place with the new operations.
 */
export function diffOperations(
  store: ChecksumStore,
  apiName: string,
  currentOps: string[],
): OperationDiff {
  const previous = store[apiName]?.operations ?? [];
  const prevSet = new Set(previous);
  const currSet = new Set(currentOps);

  const added = currentOps.filter((op) => !prevSet.has(op));
  const removed = previous.filter((op) => !currSet.has(op));

  if (store[apiName]) {
    store[apiName].operations = currentOps;
  }

  return { added, removed };
}
