/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1093.
 *
 * Date: 2026-10-24
 * Symptom: in `A\r|`, the line `|` after a segment that holds only its
 * Segment ID was not read as a segment, so it was not written back.
 * Cause: the flag that marks the field separator after a Segment ID stayed set
 * when a segment ended at its Segment ID, so the first field separator of the
 * next line was skipped as that one.
 * Resolution: the parser keeps no such flag. Every field separator opens the
 * next field, and a line that starts with one has an empty Segment ID, so the
 * line reads the same after any segment as at the start of a message.
 */

import type { Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

describe("a line of one field separator after a segment with no fields", () => {
  it("is read as an empty Segment ID and one empty field", () => {
    const root = parseHL7v2("A\r|");

    expect(root.children).toHaveLength(2);
    expect(root.children[1] as Segment).toMatchObject({
      children: [{ children: [], type: "field" }],
      name: "",
    });
  });

  it("is read as it is at the start of a message", () => {
    const after = parseHL7v2("A\r|").children[1] as Segment;
    const first = parseHL7v2("|").children[0] as Segment;

    expect(after.children).toHaveLength(first.children.length);
  });
});
