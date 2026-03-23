import { readdir, stat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";

/**
 * Simple glob implementation for .graphql files.
 * Supports ** (recursive) and * (single level) patterns.
 * Returns absolute paths.
 */
export async function glob(patterns: string[], cwd: string): Promise<string[]> {
  const results: string[] = [];

  for (const pattern of patterns) {
    const absPattern = resolve(cwd, pattern);
    const files = await expandGlob(absPattern);
    results.push(...files);
  }

  // Deduplicate and sort
  return [...new Set(results)].sort();
}

async function expandGlob(pattern: string): Promise<string[]> {
  // Split pattern into directory and file parts
  const parts = pattern.split("/");
  const starStarIdx = parts.indexOf("**");

  if (starStarIdx >= 0) {
    // Has ** — do recursive search
    const baseDir = parts.slice(0, starStarIdx).join("/");
    const filePart = parts.slice(starStarIdx + 1).join("/");
    const filePattern = filePart.replace(/\*/g, ".*").replace(/\?/g, ".");
    const regex = new RegExp(`^${filePattern}$`);

    return walkDir(baseDir, regex);
  }

  // Simple wildcard — just the last part
  const dir = parts.slice(0, -1).join("/");
  const filePart = parts[parts.length - 1];
  const filePattern = filePart.replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${filePattern}$`);

  try {
    const entries = await readdir(dir);
    const matched: string[] = [];
    for (const entry of entries) {
      if (regex.test(entry)) {
        const full = join(dir, entry);
        const s = await stat(full);
        if (s.isFile()) matched.push(full);
      }
    }
    return matched;
  } catch {
    return [];
  }
}

async function walkDir(dir: string, fileRegex: RegExp): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await walkDir(full, fileRegex)));
      } else if (entry.isFile() && fileRegex.test(entry.name)) {
        results.push(full);
      }
    }
  } catch {
    // Directory doesn't exist — skip
  }

  return results;
}
