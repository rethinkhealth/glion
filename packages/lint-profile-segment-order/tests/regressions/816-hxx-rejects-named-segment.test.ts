/**
 * Regression for https://github.com/rethinkhealth/glion/issues/816.
 *
 * Date: 2026-09-19
 * Symptom: in HL7 v2.8.1 QBP_Q11 (`MSH [{SFT}] [UAC] QPD [QBP] RCP [DSC]`,
 * where the optional group QBP holds one optional `Hxx`), a segment the
 * structure names elsewhere, such as `RCP`, was rejected in the `Hxx` (any
 * segment) position.
 * Cause: the generator compiled `Hxx` as a symbol of its own, and the runner
 * takes a concrete segment's transition before `Hxx`, so the wildcard reading
 * of `RCP` was never considered. 32 bundled structures were affected.
 * Resolution: the runner follows every state the structure can be in at
 * once, so a segment is read both as itself and as `Hxx`.
 */

import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../../src";

const lint = async (...segments: string[]) => {
  const file = new VFile();
  await unified()
    .use(hl7v2LintSegmentOrder)
    .run(
      parseHL7v2(
        [
          "MSH|^~\\&|APP|FAC|APP|FAC|20241201120000||QBP^Q11^QBP_Q11|MSG1|P|2.8.1",
          ...segments,
        ].join("\r")
      ),
      file
    );
  return file.messages.map((message) => message.reason);
};

describe("QBP_Q11 Hxx position", () => {
  it("accepts a segment the structure names elsewhere in the Hxx position", async () => {
    expect(await lint("QPD|Q11|Q1", "RCP|I", "RCP|I")).toEqual([]);
  });

  it("accepts an unnamed segment in the Hxx position", async () => {
    expect(await lint("QPD|Q11|Q1", "ZQP|1", "RCP|I")).toEqual([]);
  });
});
