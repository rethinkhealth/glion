/**
 * Regression for https://github.com/rethinkhealth/glion/issues/868.
 *
 * Date: 2026-10-06
 * Symptom: every Z-segment the event schema did not name was reported as
 * out of order, such as `Unexpected segment 'ZPI'. Expected: NK1, NTE, OBR,
 * ORC, PD1, PV1` for an ORU_R01 with a `ZPI` after its `PID`.
 * Cause: the runner rejected any segment its schema did not name. HL7v2 allows
 * local Z-segments in any message and segment group (v2.5.1 §2.11.1, §2.11.3).
 * Resolution: the runner accepts a Z-segment the schema does not name at any
 * position unless `allowZSegments` is `false`, and the rule passes its own
 * `allowZSegments` option through.
 */

import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../../src";
import type { SegmentOrderOptions } from "../../src";

const ORU = [
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG1|P|2.5\r",
  "PID|1||12345^^^MRN||Doe^John\r",
  "ZPI|1|site patient\r",
  "OBR|1|ORD1||CBC\r",
  "ZDS|1|site order\r",
  "OBX|1|NM|WBC||5.0\r",
  "ZRS|1|site result\r",
].join("");

const lint = async (options?: SegmentOrderOptions) => {
  const file = new VFile();
  await unified()
    .use(hl7v2LintSegmentOrder, options)
    .run(parseHL7v2(ORU), file);
  return file.messages.map(({ actual, reason }) => ({ actual, reason }));
};

describe("Z-segments the event schema does not name", () => {
  it("are allowed anywhere by default", async () => {
    expect(await lint()).toEqual([]);
  });

  it("are reported as unexpected when Z-segments are not allowed", async () => {
    const reason =
      "The segment is out of place; the event schema does not allow it at this point.";
    expect(await lint({ allowZSegments: false })).toEqual([
      { actual: "ZPI", reason },
      { actual: "ZDS", reason },
      { actual: "ZRS", reason },
    ]);
  });

  it("are allowed in an ADT_A01 between PID and PV1", async () => {
    const file = new VFile();
    await unified()
      .use(hl7v2LintSegmentOrder)
      .run(
        parseHL7v2(
          [
            "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20250601120000||ADT^A01^ADT_A01|MSG00001|P|2.5\r",
            "EVN|A01|20250601120000\r",
            "PID|1||PATID1234^^^HOSP^MR||DOE^JANE||19800101|F\r",
            "ZPD|1|site patient data\r",
            "PV1|1|I|WARD^101^1\r",
          ].join("")
        ),
        file
      );

    expect(file.messages).toEqual([]);
  });
});
