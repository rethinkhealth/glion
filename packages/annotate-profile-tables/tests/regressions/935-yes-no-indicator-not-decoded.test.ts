/**
 * Regression for https://github.com/rethinkhealth/glion/issues/935.
 *
 * Date: 2026-10-13
 * Symptom: PID-30 (Patient Death Indicator, table 0136) valued `N` got no
 * decoded value, while PID-8 in the same message did.
 * Cause: values were decoded through UTG, mapping table `HL7nnnn` to the code
 * system `v2-nnnn`. UTG publishes table 0136 only as a value set over code
 * system `v2-0532`, so `v2-0136` did not exist and the field was skipped.
 * Resolution: `@glion/annotate-profile-tables` decodes primitive values against
 * the tables of the message's HL7v2 version, which print table 0136 as `Y` and
 * `N`. The message in the issue places `N` in PID-32; this one places it in
 * PID-30.
 */

import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type { Segment } from "@glion/ast";
import { hl7v2Parser } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import { hl7v2AnnotateProfileTables } from "../../src";

const message = [
  "MSH|^~\\&|A||B||201410060645||ORU^R01|182|T|2.5\r",
  "PID|1||10006579^^^1^MR^1||DUCK^DONALD||19241010|M||||||||||||||||||||||N\r",
].join("");

describe("a v2.5 PID valued with a Yes/no indicator", () => {
  it("decodes PID-30 against table 0136", async () => {
    const processor = unified()
      .use(hl7v2Parser)
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2AnnotateProfileFields)
      .use(hl7v2AnnotateProfileDatatypes)
      .use(hl7v2AnnotateProfileTables);
    const file = new VFile(message);
    const tree = processor.parse(file);
    await processor.run(tree, file);
    const pid = tree.children.find(
      (node): node is Segment => node.type === "segment" && node.name === "PID"
    );

    expect(pid?.children[29]?.children[0]?.data?.tableValue).toEqual({
      description: "No",
      value: "N",
    });
  });
});
