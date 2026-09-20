/**
 * Regression for https://github.com/rethinkhealth/glion/issues/815.
 *
 * Date: 2026-09-19
 * Symptom: in HL7 v2.5 ORM_O01 a lab order (`ORC OBR`) was reported as ending
 * prematurely, a pharmacy order (`ORC RXO`) as out of order, and `ORC OBR RQD
 * RQ1 RXO ODS ODT` was accepted.
 * Cause: the profile generator compiled the standard's choice
 * `< OBR | RQD | RQ1 | RXO | ODS | ODT >` as a required sequence of all six
 * segments; it read `xsd:choice` blocks as sequences. 108 bundled structures
 * were affected.
 * Resolution: the generator writes each message structure as data, with a
 * choice as a `choice` element, and `compileStructure` compiles a choice as
 * exactly one of its alternatives.
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
          "MSH|^~\\&|OE|FAC|LAB|RFAC|20241201120000||ORM^O01^ORM_O01|MSG1|P|2.5",
          "PID|1||12345^^^MRN||Doe^John",
          ...segments,
        ].join("\r")
      ),
      file
    );
  return file.messages.map((message) => message.reason);
};

describe("ORM_O01 order detail choice", () => {
  it("accepts an order detail of one OBR", async () => {
    expect(await lint("ORC|NW|ORD1", "OBR|1|ORD1||CBC")).toEqual([]);
  });

  it("accepts an order detail of one RXO", async () => {
    expect(await lint("ORC|NW|ORD2", "RXO|RX123^Amoxicillin")).toEqual([]);
  });

  it("rejects every alternative in one order detail", async () => {
    const reasons = await lint(
      "ORC|NW|ORD3",
      "OBR|1|ORD3||CBC",
      "RQD|1",
      "RQ1|1",
      "RXO|RX123",
      "ODS|D",
      "ODT|T"
    );

    expect(reasons).toEqual([
      "Unexpected segment 'RQD'. Expected: BLG, CTD, CTI, DG1, FT1, NTE, OBX, ORC",
    ]);
  });
});
