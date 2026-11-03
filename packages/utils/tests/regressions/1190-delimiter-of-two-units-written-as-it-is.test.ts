/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1190.
 *
 * Date: 2026-11-03
 * Symptom: with a delimiter of two UTF-16 units, `escapes.write` left a
 * separator in the text it returned, so `a😀b` with the field separator `😀`
 * stayed `a😀b`, and `escapes.read` did not read back the escape sequence
 * `a🙂T🙂b` with the escape character `🙂`.
 * Cause: a value was walked and compared one UTF-16 unit at a time, so a
 * delimiter of two units was never seen as one character.
 * Resolution: a delimiter is matched whole, however many units it takes. The
 * parser reads a delimiter one unit at a time, so only a caller that passes its
 * own delimiters could reach this.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_DELIMITERS } from "../../src/constants";
import { escapes } from "../../src/escapes";

describe("a delimiter of two UTF-16 units", () => {
  it("writes a separator as its escape sequence, and reads it back", () => {
    const d = { ...DEFAULT_DELIMITERS, field: "😀" };

    expect(escapes.write("a😀b", d)).toBe("a\\F\\b");
    expect(escapes.read("a\\F\\b", d)).toBe("a😀b");
  });

  it("writes the escape character around a code, and reads it back", () => {
    const d = { ...DEFAULT_DELIMITERS, escape: "🙂" };

    expect(escapes.write("a&b", d)).toBe("a🙂T🙂b");
    expect(escapes.read("a🙂T🙂b", d)).toBe("a&b");
  });
});
