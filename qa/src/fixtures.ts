/**
 * Shared fixture helpers for QA test suites.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const FIXTURES_DIR = resolve(import.meta.dirname, "../fixtures");

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

/**
 * Discover .hl7 fixture files matching the given filter.
 * Returns sorted filenames (not full paths).
 */
export function discoverFixtures(
  filter: (filename: string) => boolean
): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".hl7") && filter(f))
    .toSorted();
}
