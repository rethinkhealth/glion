/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1139.
 *
 * Date: 2026-10-28
 * Symptom: for a message with `\r\n` line breaks or a byte order mark, every
 * position after them pointed one character early per `\r\n`, or one for the
 * byte order mark: in `MSH|^~\&\r\nPID|1`, PID covered 9–14, `\nPID|`.
 * Cause: the default preprocessing steps removed the byte order mark and
 * replaced each `\r\n` and `\n` with `\r` before tokenizing, and positions
 * were counted in the rewritten text.
 * Resolution: the tokenizer reads `\r`, `\n`, and `\r\n` as the end of a
 * segment, without rewriting the text. A byte order mark is not part of the
 * message: `stripBOM` still removes it, and positions count from the character
 * after it, so it is not tested here.
 */

import type { Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const textOf = (source: string, index: number): string => {
  const segment = parseHL7v2(source).children[index] as Segment;
  return source.slice(
    segment.position?.start.offset,
    segment.position?.end.offset
  );
};

describe("a position in a message with rewritten line breaks", () => {
  it("points at its segment after a carriage return and a line feed", () => {
    expect(textOf("MSH|^~\\&\r\nPID|1\r\nPV1|2", 2)).toBe("PV1|2");
  });

  it("points at its segment after a line feed", () => {
    expect(textOf("MSH|^~\\&\nPID|1", 1)).toBe("PID|1");
  });
});
