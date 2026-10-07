/**
 * Regression for https://github.com/rethinkhealth/glion/issues/881.
 *
 * Date: 2026-10-07
 * Symptom: a segment after a complete message was reported with an empty
 * list, such as `Unexpected segment 'PID'. Expected: ` for an ORU_R01 with a
 * `PID` after its `DSC`.
 * Cause: the runner reports the segment IDs valid at the segment's position,
 * and after the end of the message there are none. The rule printed the empty
 * list.
 * Resolution: when no segment is valid at the position, the rule reports the
 * segment as unexpected and lists nothing.
 */

import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../../src";

const ORU = [
  "MSH|^~\\&|LAB|FAC|EMR|RFAC|20241201120000||ORU^R01^ORU_R01|MSG1|P|2.5",
  "PID|1||12345^^^MRN||Doe^John",
  "OBR|1|ORD1||CBC",
  "OBX|1|NM|WBC||5.0",
  "DSC|1",
  "PID|2||67890^^^MRN||Doe^Jane",
].join("\r");

describe("a segment after the end of an ORU_R01", () => {
  it("is reported as unexpected, with no expected segments", async () => {
    const file = new VFile();
    await unified().use(hl7v2LintSegmentOrder).run(parseHL7v2(ORU), file);

    expect(file.messages.map((message) => message.reason)).toEqual([
      "Unexpected segment 'PID' (after 'DSC')",
    ]);
  });
});
