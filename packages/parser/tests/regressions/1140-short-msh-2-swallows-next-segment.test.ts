/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1140.
 *
 * Date: 2026-10-28
 * Symptom: an MSH-2 of fewer than four characters swallowed what followed it:
 * `MSH|^~\` + CR + `PID|1` + CR + `PV1|2` gave the segments MSH and PV1, with
 * MSH-2 `^~\` + CR + `PID`, and `MSH|^~\|APP|FAC` gave MSH-2 `^~\|APP`.
 * Cause: the tokenizer and delimiter detection read MSH-2 as the four
 * characters after MSH-1, whatever they were.
 * Resolution: MSH-2, and the encoding characters delimiter detection reads,
 * end at the first field delimiter or line break.
 */

import type { Field, Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const encodingCharacters = (segment: Segment): string | undefined =>
  (segment.children[1] as Field).children[0]?.children[0]?.children[0]?.value;

describe("an MSH-2 shorter than four characters", () => {
  it("ends at the field delimiter, and the next field is read", () => {
    const [msh] = parseHL7v2("MSH|^~\\|APP|FAC\rPID|1\r").children as Segment[];
    const msh3 = (msh?.children[2] as Field).children[0]?.children[0]
      ?.children[0]?.value;

    expect(encodingCharacters(msh as Segment)).toBe("^~\\");
    expect(msh3).toBe("APP");
  });

  it("ends at a carriage return, and the next segment is read", () => {
    const tree = parseHL7v2("MSH|^~\\\rPID|1\rPV1|2\r");
    const names = tree.children.map((segment) => (segment as Segment).name);

    expect(names).toStrictEqual(["MSH", "PID", "PV1"]);
    expect(encodingCharacters(tree.children[0] as Segment)).toBe("^~\\");
  });

  it("ends at a carriage return and a line feed, and the next segment is read", () => {
    const tree = parseHL7v2("MSH|^~\\\r\nPID|1\r\n");
    const names = tree.children.map((segment) => (segment as Segment).name);

    expect(names).toStrictEqual(["MSH", "PID"]);
    expect(encodingCharacters(tree.children[0] as Segment)).toBe("^~\\");
  });
});
