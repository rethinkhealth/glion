/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1087.
 *
 * Date: 2026-10-24
 * Symptom: after a segment with a Segment ID and no fields, a line that
 * starts with the field separator lost it: `|a|b` was read as Segment ID `a`
 * with one field `b`, and `|` was dropped.
 * Cause: the flag that skips the field separator after a Segment ID was not
 * cleared at the segment delimiter, so it skipped the next line's first field
 * separator instead.
 * Resolution: the parser keeps no such flag (ADR 0033, #1097). A line that
 * starts with the field separator has an empty Segment ID after any segment.
 */

import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const valueOf = (text: string) => ({
  children: [
    {
      children: [
        {
          children: [{ type: "subcomponent", value: text }],
          type: "component",
        },
      ],
      type: "field-repetition",
    },
  ],
  type: "field",
});

describe("a line that starts with the field separator, after a segment with no fields", () => {
  it("has an empty Segment ID, and its first value is a field", () => {
    const root = parseHL7v2("MSH|^~\\&|a\rPID\r|a|b");

    expect(root).toMatchObject({
      children: [
        { name: "MSH" },
        { children: [], name: "PID" },
        { children: [valueOf("a"), valueOf("b")], name: "" },
      ],
    });
  });

  it("is kept when it holds only the field separator", () => {
    const root = parseHL7v2("MSH|^~\\&|a\rPID\r|");

    expect(root).toMatchObject({
      children: [
        { name: "MSH" },
        { children: [], name: "PID" },
        { children: [{ children: [], type: "field" }], name: "" },
      ],
    });
  });
});
