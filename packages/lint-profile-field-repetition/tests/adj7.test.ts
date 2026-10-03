import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { f, m, r, s } from "@glion/builder";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintFieldRepetition from "../src";

/**
 * Minimal MSH anchoring a v2.7.1 message; the profile context is derived
 * from MSH-12.1.
 */
function msh271() {
  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(""),
    f("EHC_E15"),
    f("MSG001"),
    f("P"),
    f("2.7.1")
  );
}

describe("ADJ-7 repetition (HL7 v2.7.1)", () => {
  // ADJ-7 ("Adjustment Reason PA", item 2009) is `rpt=1` (non-repeatable) per
  // the HL7 v2.7.1 spec, even though the field is marked `deprecated`. Guard
  // against the profile regressing to `repeatable: true`, which would make
  // @glion/lint-profile-field-repetition silently accept repeated ADJ-7.
  it("flags repeated ADJ-7 as non-repeatable", async () => {
    const tree = m(
      msh271(),
      s(
        "ADJ",
        f("1"),
        f("2"),
        f("3"),
        f("4"),
        f("5"),
        f("6"),
        f(r("REASON1"), r("REASON2"), r("REASON3"))
      )
    );
    const file = new VFile();

    await unified()
      .use(hl7v2AnnotateProfileContext)
      .use(hl7v2LintFieldRepetition)
      .run(tree, file);

    const errors = file.messages.filter(
      (msg) => msg.ruleId === "field-repetition"
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toEqual(
      "Field ADJ-7 (Adjustment Reason PA) is not repeatable but has 3 repetitions"
    );
    expect(errors[0]?.source).toBe("hl7v2-lint");
  });
});
