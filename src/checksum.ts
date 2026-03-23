import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";

export interface ChecksumStore {
  [apiName: string]: string; // SHA-256 hex of schema text
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
    return JSON.parse(raw);
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
  const oldHash = store[apiName];
  store[apiName] = newHash;
  return oldHash !== newHash;
}
