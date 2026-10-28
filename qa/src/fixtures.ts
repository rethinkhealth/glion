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

/**
 * Normalize a message to the text the serializer writes for it: line endings
 * as \r, and one \r after the last segment.
 *
 * The parser accepts \r, \n, and \r\n, with or without a terminator after the
 * last segment, but the serializer always writes \r after every segment.
 */
export function normalize(msg: string): string {
  const segments = msg
    .replaceAll("\r\n", "\r") // CRLF → CR
    .replaceAll("\n", "\r") // LF → CR
    .replace(/\r+$/, ""); // trim trailing segment terminators
  return segments === "" ? "" : `${segments}\r`;
}
