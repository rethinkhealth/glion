/**
 * Regression for https://github.com/rethinkhealth/glion/issues/916.
 *
 * Date: 2026-10-10
 * Symptom: a valid v2.7.1 ADT^A01 got four findings, each checking a field
 * against the profile of another field: `EVN-1` and `PID-2` were reported
 * empty though required, `PID-3` was checked against the table of `PID-5`, and
 * `PID-5` against the datatype of `PID-7`.
 * Cause: from v2.6 on, the bundled field profiles left out the fields HL7
 * withdrew and gave every field after one the sequence of its place in the
 * list, so a lookup by sequence found the wrong field.
 * Resolution: the generator takes each field's sequence from HL7DB and keeps
 * the withdrawn fields, and the bundled data is regenerated.
 */

import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2PresetLintProfileRecommended from "../../src";

describe("a valid v2.7.1 ADT^A01", () => {
  it("gets no finding from a field checked against another field's profile", async () => {
    const message = [
      "MSH|^~\\&|SENDER|FAC|RECV|RFAC|20241201||ADT^A01^ADT_A01|MSG001|P|2.7.1\r",
      "EVN||20241201\r",
      "PID|1||12345^^^HOSP^MR||Doe^John\r",
      "PV1|1|I\r",
    ].join("");
    const file = new VFile();

    await unified()
      .use(hl7v2PresetLintProfileRecommended)
      .run(parseHL7v2(message), file);

    // The one finding left is a separate data bug (rethinkhealth/hl7v2-profiles#158):
    // table-values checks the family name against PID-5's table 0200, which
    // the standard applies to XPN.7 (Name Type Code).
    expect(file.messages.map(String)).toEqual([
      "3:25-3:33: The value is not in table `HL70200` (Name Type); the field requires a code from it.",
    ]);
  });
});
