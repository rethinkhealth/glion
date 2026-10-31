/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1158.
 *
 * Date: 2026-10-30
 * Symptom: an empty line between segments was dropped: `MSH|^~\&` + CR + CR +
 * `PID|1` gave the segments MSH and PID, and was written back without the
 * empty line. An empty line before MSH stopped the message header being read:
 * CR + `MSH|^~\&` + CR + `PID|1` gave an MSH with one field, written back as
 * `MSH|` + CR + `PID|1`.
 * Cause: the processor opened a segment only at a token that was not a segment
 * terminator, so a terminator with no segment open was skipped. The tokenizer
 * read the message header only at offset 0.
 * Resolution: an empty line is read as an empty segment, with an empty Segment
 * ID, no fields, and the terminator that ended it. The message header is read
 * after the empty lines that come before it.
 */

import type { Field, Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const segments = (text: string) =>
  (parseHL7v2(text).children as Segment[]).map(
    ({ children, name, terminator }) => [name, children.length, terminator]
  );

const fieldValue = (segment: Segment | undefined, index: number) =>
  (segment?.children[index] as Field | undefined)?.children[0]?.children[0]
    ?.children[0]?.value;

describe("an empty line", () => {
  it("is read as an empty segment between two segments", () => {
    expect(segments("MSH|^~\\&\r\rPID|1\r")).toStrictEqual([
      ["MSH", 2, "\r"],
      ["", 0, "\r"],
      ["PID", 1, "\r"],
    ]);
  });

  it("is read as an empty segment with the terminator that ended it", () => {
    expect(segments("MSH|^~\\&\r\n\r\nPID|1\r\n")).toStrictEqual([
      ["MSH", 2, "\r\n"],
      ["", 0, "\r\n"],
      ["PID", 1, "\r\n"],
    ]);
  });

  it("is read as an empty segment after the last segment", () => {
    expect(segments("MSH|^~\\&\rPID|1\r\r")).toStrictEqual([
      ["MSH", 2, "\r"],
      ["PID", 1, "\r"],
      ["", 0, "\r"],
    ]);
  });

  it("is positioned at the start of its line, with no width", () => {
    const empty = parseHL7v2("MSH|^~\\&\r\rPID|1\r").children[1];

    expect(empty?.position).toStrictEqual({
      end: { column: 1, line: 2, offset: 9 },
      start: { column: 1, line: 2, offset: 9 },
    });
  });

  it("counts as a line for the segments after it", () => {
    const pid = parseHL7v2("MSH|^~\\&\r\rPID|1\r").children[2];

    expect(pid?.position).toStrictEqual({
      end: { column: 6, line: 3, offset: 15 },
      start: { column: 1, line: 3, offset: 10 },
    });
  });
});

describe("an empty line before the message header", () => {
  it("is read as an empty segment, and MSH-1 and MSH-2 are read after it", () => {
    const source = "\rMSH|^~\\&|APP\rPID|1";
    const msh = parseHL7v2(source).children[1] as Segment;

    expect(segments(source)).toStrictEqual([
      ["", 0, "\r"],
      ["MSH", 3, "\r"],
      ["PID", 1, ""],
    ]);
    expect(fieldValue(msh, 0)).toBe("|");
    expect(fieldValue(msh, 1)).toBe("^~\\&");
    expect(fieldValue(msh, 2)).toBe("APP");
  });
});
