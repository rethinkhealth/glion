/**
 * Regression for https://github.com/rethinkhealth/glion/issues/816.
 *
 * Date: 2026-09-19
 * Symptom: in HL7 v2.8.1 QBP_Q11 (`MSH [{SFT}] [UAC] QPD [QBP] RCP [DSC]`,
 * where the optional group QBP holds one optional `Hxx`), a segment the
 * schema names elsewhere, such as `RCP`, was rejected in the `Hxx` (any
 * segment) position.
 * Cause: the generator compiled `Hxx` as a symbol of its own, and the runner
 * takes a concrete segment's transition before `Hxx`, so the wildcard reading
 * of `RCP` was never considered. 32 bundled schemas were affected.
 * Resolution: the runner follows every state the schema can be in at
 * once, so a segment is read both as itself and as `Hxx`.
 */

import type { Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../../src";

const lint = async (...segments: Segment[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2LintSegmentOrder)
    .run(
      parseHL7v2(
        toHl7v2(
          m(
            // MSH|^~\&|APP|FAC|APP|FAC|20241201120000||QBP^Q11^QBP_Q11|MSG1|P|2.8.1
            s(
              "MSH",
              f("|"),
              f("^~\\&"),
              f("APP"),
              f("FAC"),
              f("APP"),
              f("FAC"),
              f("20241201120000"),
              f(),
              f("QBP", "Q11", "QBP_Q11"),
              f("MSG1"),
              f("P"),
              f("2.8.1")
            ),
            ...segments
          )
        )
      ),
      file
    );
  return file.messages.map((message) => message.reason);
};

describe("QBP_Q11 Hxx position", () => {
  it("accepts a segment the schema names elsewhere in the Hxx position", async () => {
    expect(
      await lint(
        // QPD|Q11|Q1
        s("QPD", f("Q11"), f("Q1")),
        // RCP|I
        s("RCP", f("I")),
        // RCP|I
        s("RCP", f("I"))
      )
    ).toEqual([]);
  });

  it("accepts an unnamed segment in the Hxx position", async () => {
    expect(
      await lint(
        // QPD|Q11|Q1
        s("QPD", f("Q11"), f("Q1")),
        // ZQP|1
        s("ZQP", f("1")),
        // RCP|I
        s("RCP", f("I"))
      )
    ).toEqual([]);
  });
});
