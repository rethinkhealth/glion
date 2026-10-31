/**
 * Regression for https://github.com/rethinkhealth/glion/issues/976.
 *
 * Date: 2026-10-15
 * Symptom: in `PID|1|^`, the finding for the trailing empty field ran one
 * character past the segment, over the segment terminator, and listed the
 * trailing fields after the segment in `ancestors`.
 * Cause: the rule ended the range one character after the last empty field,
 * which reaches the segment's last field separator only when the segment ends
 * with one, and appended the trailing fields to the segment's ancestors.
 * Resolution: the range ends where the segment ends, and `ancestors` ends at
 * the segment the finding is about.
 *
 * The test sets `strict: true`: since ADR 0033 a segment that ends with one
 * empty field is reported only then.
 */

import type { Segment } from "@glion/ast";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintNoTrailingEmptyField from "../../src";

describe("a segment that ends with an empty composite field", () => {
  it("is reported from the empty field to the end of the segment", async () => {
    const file = new VFile("MSH|^~\\&|A\rPID|1|^\rPV1|1\r");
    const processor = unified()
      .use(hl7v2Parser)
      .use(hl7v2LintNoTrailingEmptyField, { strict: true });
    const tree = processor.parse(file);
    await processor.run(tree, file);
    const pid = tree.children[1] as Segment;

    expect(file.messages).toHaveLength(1);
    expect(file.messages[0]).toMatchObject({
      message: "The segment has 1 trailing field separator.",
      note: "HL7v2 does not require field separators after the last field with a value.",
      ruleId: "no-trailing-empty-field",
      source: "hl7v2-lint",
    });
    expect(file.messages[0]?.place).toStrictEqual({
      end: { column: 8, line: 2, offset: 18 },
      start: { column: 7, line: 2, offset: 17 },
    });
    expect(file.messages[0]?.ancestors).toStrictEqual([tree, pid]);
  });
});
