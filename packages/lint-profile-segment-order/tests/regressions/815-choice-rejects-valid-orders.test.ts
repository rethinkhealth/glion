/**
 * Regression for https://github.com/rethinkhealth/glion/issues/815.
 *
 * Date: 2026-09-19
 * Symptom: in HL7 v2.5 ORM_O01 a lab order (`ORC OBR`) was reported as ending
 * prematurely, a pharmacy order (`ORC RXO`) as out of order, and `ORC OBR RQD
 * RQ1 RXO ODS ODT` was accepted.
 * Cause: the profile generator compiled the standard's choice
 * `< OBR | RQD | RQ1 | RXO | ODS | ODT >` as a required sequence of all six
 * segments; it read `xsd:choice` blocks as sequences. 108 bundled schemas
 * were affected.
 * Resolution: the generator writes each event schema as data, with a
 * choice as a `choice` element, and the engine reads a choice as exactly one
 * of its alternatives.
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
            // MSH|^~\&|OE|FAC|LAB|RFAC|20241201120000||ORM^O01^ORM_O01|MSG1|P|2.5
            s(
              "MSH",
              f("|"),
              f("^~\\&"),
              f("OE"),
              f("FAC"),
              f("LAB"),
              f("RFAC"),
              f("20241201120000"),
              f(),
              f("ORM", "O01", "ORM_O01"),
              f("MSG1"),
              f("P"),
              f("2.5")
            ),
            // PID|1||12345^^^MRN||Doe^John
            s(
              "PID",
              f("1"),
              f(),
              f("12345", "", "", "MRN"),
              f(),
              f("Doe", "John")
            ),
            ...segments
          )
        )
      ),
      file
    );
  return file.messages.map((message) => message.reason);
};

describe("ORM_O01 order detail choice", () => {
  it("accepts an order detail of one OBR", async () => {
    expect(
      await lint(
        // ORC|NW|ORD1
        s("ORC", f("NW"), f("ORD1")),
        // OBR|1|ORD1||CBC
        s("OBR", f("1"), f("ORD1"), f(), f("CBC"))
      )
    ).toEqual([]);
  });

  it("accepts an order detail of one RXO", async () => {
    expect(
      await lint(
        // ORC|NW|ORD2
        s("ORC", f("NW"), f("ORD2")),
        // RXO|RX123^Amoxicillin
        s("RXO", f("RX123", "Amoxicillin"))
      )
    ).toEqual([]);
  });

  it("rejects every alternative in one order detail", async () => {
    const reasons = await lint(
      // ORC|NW|ORD3
      s("ORC", f("NW"), f("ORD3")),
      // OBR|1|ORD3||CBC
      s("OBR", f("1"), f("ORD3"), f(), f("CBC")),
      // RQD|1
      s("RQD", f("1")),
      // RQ1|1
      s("RQ1", f("1")),
      // RXO|RX123
      s("RXO", f("RX123")),
      // ODS|D
      s("ODS", f("D")),
      // ODT|T
      s("ODT", f("T"))
    );

    // Each further alternative reads as a new order without its ORC.
    expect(reasons).toEqual([
      "Segment `ORC` of segment group `ORDER` is missing; the event schema requires it at this point.",
      "Segment `ORC` of segment group `ORDER` is missing; the event schema requires it at this point.",
      "Segment `ORC` of segment group `ORDER` is missing; the event schema requires it at this point.",
      "Segment `ORC` of segment group `ORDER` is missing; the event schema requires it at this point.",
      "Segment `ORC` of segment group `ORDER` is missing; the event schema requires it at this point.",
    ]);
  });
});
