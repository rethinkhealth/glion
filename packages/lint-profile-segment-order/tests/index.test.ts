import type { Field, Root, Segment } from "@glion/ast";
import { f, g, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import type { EventSchema } from "@glion/profiles";
import { profiles } from "@glion/profiles";
import { toHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import type { SegmentOrderOptions } from "../src";
import hl7v2LintSegmentOrder from "../src";

/** The HL7v2 text of the message `segments` make. */
const hl7 = (...segments: Segment[]) => toHl7v2(m(...segments));

/**
 * An MSH segment with `messageType` as MSH-9 and `version` as MSH-12; with no
 * `definition`, the rule checks the message against the event schema they
 * name.
 */
const msh = (messageType: Field, version: Field) =>
  // MSH|^~\&|SENDER|FAC|RECV|RFAC|20241201||<messageType>|MSG001|P|<version>
  s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("SENDER"),
    f("FAC"),
    f("RECV"),
    f("RFAC"),
    f("20241201"),
    f(),
    messageType,
    f("MSG001"),
    f("P"),
    version
  );

/**
 * An MSH segment with its delimiters only, for a message checked against an
 * event schema the test gives.
 */
const MSH =
  // MSH|^~\&
  s("MSH", f("|"), f("^~\\&"));

/** The findings of the rule on `tree`. */
const run = async (tree: Root, options?: SegmentOrderOptions) => {
  const file = new VFile();
  await unified().use(hl7v2LintSegmentOrder, options).run(tree, file);
  return file.messages;
};

/**
 * The findings of the rule on a message of `segments`, written as HL7v2 text
 * and parsed, checked against the event schema its MSH names.
 */
const lint = (...segments: Segment[]) => run(parseHL7v2(hl7(...segments)));

/**
 * The findings of the rule on a message of `segments`, written as HL7v2 text
 * and parsed, checked against `definition`.
 */
const lintAgainst = (definition: EventSchema, ...segments: Segment[]) =>
  run(parseHL7v2(hl7(...segments)), { definition });

/** The text of each finding, in order. */
const reasons = (messages: readonly { reason: string }[]) =>
  messages.map((message) => message.reason);

/** `count` copies of `segment`. */
const repeated = (segment: Segment, count: number) =>
  Array.from({ length: count }, () => segment);

/** MSH, then PID, both required. */
const MSH_PID: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    { name: "PID", optional: false, repeating: false, type: "segment" },
  ],
  id: "TEST",
};

/** MSH, PID, then PV1, all required. */
const MSH_PID_PV1: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    { name: "PID", optional: false, repeating: false, type: "segment" },
    { name: "PV1", optional: false, repeating: false, type: "segment" },
  ],
  id: "TEST",
};

/** MSH, then one or more OBX, then PV1. */
const MSH_OBX_PV1: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    { name: "OBX", optional: false, repeating: true, type: "segment" },
    { name: "PV1", optional: false, repeating: false, type: "segment" },
  ],
  id: "TEST",
};

/**
 * MSH PATIENT { ORDER } [DSC], where PATIENT is `PID [PD1]`, ORDER is
 * `[ORC] OBR [{ RESULT }]`, and RESULT is `OBX [{ NTE }]`: the shape of an
 * ORU_R01, small enough to read.
 */
const LAB: EventSchema = {
  elements: [
    { name: "MSH", optional: false, repeating: false, type: "segment" },
    {
      elements: [
        { name: "PID", optional: false, repeating: false, type: "segment" },
        { name: "PD1", optional: true, repeating: false, type: "segment" },
      ],
      id: "PATIENT",
      name: "Patient",
      optional: false,
      repeating: false,
      type: "group",
    },
    {
      elements: [
        { name: "ORC", optional: true, repeating: false, type: "segment" },
        { name: "OBR", optional: false, repeating: false, type: "segment" },
        {
          elements: [
            { name: "OBX", optional: false, repeating: false, type: "segment" },
            { name: "NTE", optional: true, repeating: true, type: "segment" },
          ],
          id: "RESULT",
          name: "Result",
          optional: true,
          repeating: true,
          type: "group",
        },
      ],
      id: "ORDER",
      name: "Order",
      optional: false,
      repeating: true,
      type: "group",
    },
    { name: "DSC", optional: true, repeating: false, type: "segment" },
  ],
  id: "LAB",
};

// An event schema (the message structure HL7v2 chapters print for each
// trigger event, such as ADT_A01) lists the segments of a message in order:
// each required or optional, each repeating or not, some in segment groups.
// When a message does not fit, the rule reads it as the message the schema
// accepts with the fewest edits, and reports each edit: a segment the schema
// requires and the message lacks (missing), or a segment the message has where
// the schema does not allow it (out of place).
describe("hl7v2LintSegmentOrder", () => {
  describe("a message that fits its event schema", () => {
    it("accepts its segments in the order the schema gives", async () => {
      expect(
        await lintAgainst(
          MSH_PID,
          MSH,
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });

    // OBX may repeat, so three in a row fit.
    it("accepts a repeating segment that repeats", async () => {
      expect(
        await lintAgainst(
          MSH_OBX_PV1,
          MSH,
          // OBX|1
          s("OBX", f("1")),
          // OBX|2
          s("OBX", f("2")),
          // OBX|3
          s("OBX", f("3")),
          // PV1|1
          s("PV1", f("1"))
        )
      ).toEqual([]);
    });

    // Grouping (as `@glion/transform-profile-groups` does) nests segments under
    // group nodes; HL7v2 text cannot express that, so the tree is built
    // directly. The rule reads the segments in document order.
    it("accepts a message whose segments are nested in segment groups", async () => {
      expect(
        await run(m(s("MSH"), g("PATIENT", s("PID"), g("VISIT", s("PV1")))), {
          definition: MSH_PID_PV1,
        })
      ).toEqual([]);
    });
  });

  describe("a segment the event schema requires and the message lacks", () => {
    // The full finding: its text, the segment the schema requires (`expected`),
    // where it would be inserted (`place`, the start of the segment it comes
    // before), the nodes that hold that point (`ancestors`), and which rule
    // made it.
    it("reports the segment missing where it would be inserted", async () => {
      const tree = parseHL7v2(
        hl7(
          MSH,
          // PV1|1
          s("PV1", f("1"))
        )
      );
      const [message, ...rest] = await run(tree, { definition: MSH_PID_PV1 });

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
      expect(message?.expected).toEqual(["PID"]);
      expect(message?.actual).toBeUndefined();
      expect(message?.place).toEqual({ column: 1, line: 2, offset: 9 });
      expect(message?.ancestors).toEqual([tree]);
      expect(message?.ruleId).toBe("segment-order");
      expect(message?.source).toBe("hl7v2-lint");
    });

    // The message stops after MSH, so PID would go on the line after it.
    it("reports a segment missing at the end at the end of the message", async () => {
      const [message, ...rest] = await lintAgainst(MSH_PID, MSH);

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
      expect(message?.place).toEqual({ column: 1, line: 2, offset: 9 });
    });

    // An ADT_A01 needs EVN after MSH and PV1 after PID; both are reported.
    it("reports each missing segment, not only the first", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A01", "ADT_A01"), f("2.5")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `EVN` is missing; the event schema requires it at this point.",
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // A message with no segments lacks every required one, MSH included.
    it("reports every required segment of a message with no segments", async () => {
      expect(reasons(await lintAgainst(MSH_PID))).toEqual([
        "Segment `MSH` is missing; the event schema requires it at this point.",
        "Segment `PID` is missing; the event schema requires it at this point.",
      ]);
    });

    // The message stops after MSH, so the point PID would go at is in the
    // message itself, and no segment holds it.
    it("gives the message as the ancestors of a segment missing at its end", async () => {
      const tree = parseHL7v2(hl7(MSH));
      const [message] = await run(tree, { definition: MSH_PID });

      expect(message?.ancestors).toEqual([tree]);
    });

    // A tree built without positions has no end to point at.
    it("reports a segment missing at the end without a place when the message has no position", async () => {
      const messages = await run(m(s("MSH")), { definition: MSH_PID });

      expect(reasons(messages)).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
      ]);
      expect(messages[0]?.place).toBeUndefined();
    });

    // PID belongs in INNER, which is inside OUTER: the report names both,
    // outermost first.
    it("names each segment group a missing segment belongs in, outermost first", async () => {
      expect(
        reasons(
          await lintAgainst(
            {
              elements: [
                {
                  name: "MSH",
                  optional: false,
                  repeating: false,
                  type: "segment",
                },
                {
                  elements: [
                    {
                      elements: [
                        {
                          name: "PID",
                          optional: false,
                          repeating: false,
                          type: "segment",
                        },
                      ],
                      id: "INNER",
                      name: "Inner",
                      optional: false,
                      repeating: false,
                      type: "group",
                    },
                  ],
                  id: "OUTER",
                  name: "Outer",
                  optional: false,
                  repeating: false,
                  type: "group",
                },
              ],
              id: "TEST",
            },
            MSH
          )
        )
      ).toEqual([
        "Segment `PID` of segment group `OUTER > INNER` is missing; the event schema requires it at this point.",
      ]);
    });

    // PID belongs in the PATIENT group, and OBR in ORDER.
    it("names the segment groups the missing segment belongs in", async () => {
      expect(
        reasons(
          await lintAgainst(
            LAB,
            MSH,
            // OBR|1
            s("OBR", f("1")),
            // OBX|1
            s("OBX", f("1"))
          )
        )
      ).toEqual([
        "Segment `PID` of segment group `PATIENT` is missing; the event schema requires it at this point.",
      ]);
      expect(
        reasons(
          await lintAgainst(
            LAB,
            MSH,
            // PID|1
            s("PID", f("1")),
            // OBX|1
            s("OBX", f("1")),
            // OBX|2
            s("OBX", f("2"))
          )
        )
      ).toEqual([
        "Segment `OBR` of segment group `ORDER` is missing; the event schema requires it at this point.",
      ]);
    });

    // ORC may only start an ORDER, so after OBX it opens a second ORDER, which
    // then lacks its OBR. Reading ORC as out of place would also take one
    // edit, but discards a segment the sender wrote.
    it("reads a segment that can start a new segment group as that group's, with the group's required segment missing", async () => {
      expect(
        reasons(
          await lintAgainst(
            LAB,
            MSH,
            // PID|1
            s("PID", f("1")),
            // OBR|1
            s("OBR", f("1")),
            // OBX|1
            s("OBX", f("1")),
            // ORC|1
            s("ORC", f("1")),
            // OBX|2
            s("OBX", f("2"))
          )
        )
      ).toEqual([
        "Segment `OBR` of segment group `ORDER` is missing; the event schema requires it at this point.",
      ]);
    });

    // The tree is grouped (see "nested in segment groups" above); PID would go
    // before PV1, inside PATIENT, so PATIENT holds that point.
    it("gives the nodes that hold the point it would be inserted at as ancestors", async () => {
      const patient = g("PATIENT", s("PV1"));
      const tree = m(s("MSH"), patient);

      const [message] = await run(tree, { definition: MSH_PID_PV1 });

      expect(message?.ancestors).toEqual([tree, patient]);
    });

    // `Hxx` is the schema's name for a slot any segment fills, not a Segment
    // ID, so the report describes the slot in words and sets no `expected`.
    it("reports a missing slot that any segment fills in words", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            { name: "Hxx", optional: false, repeating: false, type: "segment" },
          ],
          id: "TEST",
        },
        MSH
      );

      expect(reasons(messages)).toEqual([
        "A segment is missing; the event schema requires a segment with any Segment ID at this point.",
      ]);
      expect(messages[0]?.expected).toBeUndefined();
    });

    // The same slot inside a segment group names the group.
    it("names the segment group of a missing slot that any segment fills", async () => {
      expect(
        reasons(
          await lintAgainst(
            {
              elements: [
                {
                  name: "MSH",
                  optional: false,
                  repeating: false,
                  type: "segment",
                },
                {
                  elements: [
                    {
                      name: "Hxx",
                      optional: false,
                      repeating: false,
                      type: "segment",
                    },
                  ],
                  id: "SITE",
                  name: "Site",
                  optional: false,
                  repeating: false,
                  type: "group",
                },
              ],
              id: "TEST",
            },
            MSH
          )
        )
      ).toEqual([
        "A segment of segment group `SITE` is missing; the event schema requires a segment with any Segment ID at this point.",
      ]);
    });

    // `anyZSegment` is the schema's name for a slot any Z-segment fills.
    it("reports a missing slot that any Z-segment fills in words", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            {
              name: "anyZSegment",
              optional: false,
              repeating: false,
              type: "segment",
            },
          ],
          id: "TEST",
        },
        MSH
      );

      expect(reasons(messages)).toEqual([
        "A Z-segment is missing; the event schema requires a Z-segment at this point.",
      ]);
      expect(messages[0]?.expected).toBeUndefined();
    });

    // The same slot inside a segment group names the group.
    it("names the segment group of a missing slot that any Z-segment fills", async () => {
      expect(
        reasons(
          await lintAgainst(
            {
              elements: [
                {
                  name: "MSH",
                  optional: false,
                  repeating: false,
                  type: "segment",
                },
                {
                  elements: [
                    {
                      name: "anyZSegment",
                      optional: false,
                      repeating: false,
                      type: "segment",
                    },
                  ],
                  id: "SITE",
                  name: "Site",
                  optional: false,
                  repeating: false,
                  type: "group",
                },
              ],
              id: "TEST",
            },
            MSH
          )
        )
      ).toEqual([
        "A Z-segment of segment group `SITE` is missing; the event schema requires a Z-segment at this point.",
      ]);
    });
  });

  describe("a segment where the event schema does not allow it", () => {
    // The full finding: its text, the segment found (`actual`), its position
    // (`place`), the segment and the nodes above it (`ancestors`), and which
    // rule made it. The first segment of the message is out of place too:
    // the message is read from it.
    it("reports the segment out of place on itself", async () => {
      const tree = parseHL7v2(
        hl7(
          // XXX|1
          s("XXX", f("1")),
          MSH,
          // PID|1
          s("PID", f("1"))
        )
      );
      const [message, ...rest] = await run(tree, { definition: MSH_PID });

      expect(rest).toEqual([]);
      expect(message?.message).toBe(
        "The segment is out of place; the event schema does not allow it at this point."
      );
      expect(message?.actual).toBe("XXX");
      expect(message?.expected).toBeUndefined();
      expect(message?.place).toEqual({
        end: { column: 6, line: 1, offset: 5 },
        start: { column: 1, line: 1, offset: 0 },
      });
      expect(message?.ancestors).toEqual([tree, tree.children[0]]);
      expect(message?.ruleId).toBe("segment-order");
      expect(message?.source).toBe("hl7v2-lint");
    });

    // DSC ends an ORU_R01; a PID after it starts nothing.
    it("reports a segment after the end of the message structure", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ORU", "R01", "ORU_R01"), f("2.5")),
            // PID|1
            s("PID", f("1")),
            // OBR|1
            s("OBR", f("1")),
            // OBX|1
            s("OBX", f("1")),
            // DSC|1
            s("DSC", f("1")),
            // PID|2
            s("PID", f("2"))
          )
        )
      ).toEqual([
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
    });

    // PV1 is in no group of LAB. It follows an OBX, so it is read in OBX's
    // groups, ORDER > RESULT.
    it("reports an out-of-place segment read in segment groups", async () => {
      const messages = await lintAgainst(
        LAB,
        MSH,
        // PID|1
        s("PID", f("1")),
        // OBR|1
        s("OBR", f("1")),
        // OBX|1
        s("OBX", f("1")),
        // PV1|1
        s("PV1", f("1")),
        // OBX|2
        s("OBX", f("2"))
      );

      expect(reasons(messages)).toEqual([
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
      expect(messages[0]?.actual).toBe("PV1");
    });

    // `|1` has no characters before its first field separator: an empty
    // Segment ID.
    it("reports a segment with an empty Segment ID", async () => {
      const messages = await lintAgainst(
        MSH_PID,
        MSH,
        // |1
        s("", f("1")),
        // PID|1
        s("PID", f("1"))
      );

      expect(reasons(messages)).toEqual([
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
      expect(messages[0]?.actual).toBe("");
    });

    // The same, after an OBX of LAB: read in OBX's groups.
    it("reports a segment with an empty Segment ID read in segment groups", async () => {
      const messages = await lintAgainst(
        LAB,
        MSH,
        // PID|1
        s("PID", f("1")),
        // OBR|1
        s("OBR", f("1")),
        // OBX|1
        s("OBX", f("1")),
        // |1
        s("", f("1"))
      );

      expect(reasons(messages)).toEqual([
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
      expect(messages[0]?.actual).toBe("");
    });

    // PV1 and PID are swapped inside a PATIENT group of a grouped tree (see
    // "nested in segment groups" above). The group does not change the
    // reading: PID is missing before PV1, and the late PID is out of place.
    it("reports segments out of order inside a segment group", async () => {
      expect(
        reasons(
          await run(m(s("MSH"), g("PATIENT", s("PV1"), s("PID"))), {
            definition: MSH_PID_PV1,
          })
        )
      ).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
    });

    // A tree built without positions gives the reports none either.
    it("reports without a place when the segments have no position", async () => {
      const messages = await run(m(s("MSH"), s("XXX")), {
        definition: MSH_PID,
      });

      expect(messages.map((message) => message.place)).toEqual([
        undefined,
        undefined,
      ]);
    });
  });

  describe("a segment in place of a required one", () => {
    // PIDX stands where PID belongs. A Segment ID names a structure, not a
    // string with a typo, so PIDX is a different segment: PID is missing and
    // PIDX is out of place, two reports.
    it("reports the required segment missing and the one in its place out of place", async () => {
      expect(
        reasons(
          await lintAgainst(
            MSH_PID_PV1,
            MSH,
            // PIDX|1
            s("PIDX", f("1")),
            // PV1|1
            s("PV1", f("1"))
          )
        )
      ).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
    });

    // Two segments stand where PID and PV1 belong. Each is reported right after
    // the required segment it displaces, not all missing segments first.
    it("reports each segment out of place next to the required one it displaces", async () => {
      expect(
        reasons(
          await lintAgainst(
            MSH_PID_PV1,
            MSH,
            // AAA|1
            s("AAA", f("1")),
            // BBB|1
            s("BBB", f("1"))
          )
        )
      ).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
        "Segment `PV1` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
    });

    // PID before EVN in an ADT_A01: the fewest edits read EVN as missing
    // before PID, then PV1 as missing after PID, at the start of the late EVN,
    // and that EVN as out of place.
    it("reports two segments in swapped order as edits, not as a swap", async () => {
      const messages = await lint(
        msh(f("ADT", "A01", "ADT_A01"), f("2.5")),
        // PID|1
        s("PID", f("1")),
        // EVN|A01
        s("EVN", f("A01"))
      );

      expect(reasons(messages)).toEqual([
        "Segment `EVN` is missing; the event schema requires it at this point.",
        "Segment `PV1` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
      expect(messages[1]?.place).toEqual({ column: 1, line: 3, offset: 75 });
    });
  });

  // The rule reports at most 20 edits for a message, then a count of the rest.
  // A message of more than 1,000 segments is not repaired; the rule reports
  // the first segment that does not fit, with a note that says so.
  describe("limits", () => {
    // PID is missing and 25 XXX segments are out of place: 26 edits.
    it("reports 20 edits, then the count of the rest on the message", async () => {
      const tree = parseHL7v2(
        hl7(
          MSH,
          ...repeated(
            // XXX|1
            s("XXX", f("1")),
            25
          )
        )
      );
      const messages = await run(tree, { definition: MSH_PID });

      expect(messages).toHaveLength(21);
      expect(messages[0]?.reason).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
      expect(messages[20]?.reason).toBe(
        "The message has 6 more missing or out-of-place segments; the rule reports the first 20."
      );
      expect(messages[20]?.ancestors).toEqual([tree]);
    });

    // PID is missing and 20 XXX segments are out of place: 21 edits.
    it("counts one edit past the 20th in the singular", async () => {
      const messages = await lintAgainst(
        MSH_PID,
        MSH,
        ...repeated(
          // XXX|1
          s("XXX", f("1")),
          20
        )
      );

      expect(messages).toHaveLength(21);
      expect(messages[20]?.reason).toBe(
        "The message has 1 more missing or out-of-place segment; the rule reports the first 20."
      );
    });

    // Against MSH, EVN and 13 required PIDs, EVN is missing on its own, the
    // first PID fits, and each BBB stands where one of the 12 other PIDs
    // belongs: EVN, then 12 pairs of PID missing and BBB out of place, 25
    // edits. The 20th is the 10th PID missing; the 21st, the BBB standing
    // where it belongs, is reported with it, then the count of the other 4.
    it("reports the out-of-place segment standing where the 20th edit's missing segment belongs", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            { name: "EVN", optional: false, repeating: false, type: "segment" },
            ...Array.from({ length: 13 }, () => ({
              name: "PID",
              optional: false,
              repeating: false,
              type: "segment" as const,
            })),
          ],
          id: "TEST",
        },
        MSH,
        // PID|1
        s("PID", f("1")),
        ...repeated(
          // BBB|1
          s("BBB", f("1")),
          12
        )
      );

      expect(messages).toHaveLength(22);
      expect(messages[19]?.reason).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
      expect(messages[20]?.reason).toBe(
        "The segment is out of place; the event schema does not allow it at this point."
      );
      expect(messages[21]?.reason).toBe(
        "The message has 4 more missing or out-of-place segments; the rule reports the first 21."
      );
    });

    // PID is missing and 19 XXX segments are out of place: 20 edits, each its
    // own report.
    it("reports exactly 20 edits with no count", async () => {
      const messages = await lintAgainst(
        MSH_PID,
        MSH,
        ...repeated(
          // XXX|1
          s("XXX", f("1")),
          19
        )
      );

      expect(messages).toHaveLength(20);
      expect(
        messages.every((message) => message.expected ?? message.actual)
      ).toBe(true);
    });

    // Against MSH and 20 required PIDs, a message of MSH alone lacks all 20:
    // 20 edits, each its own report, the last a missing segment.
    it("reports exactly 20 missing segments with no count", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            ...Array.from({ length: 20 }, () => ({
              name: "PID",
              optional: false,
              repeating: false,
              type: "segment" as const,
            })),
          ],
          id: "TEST",
        },
        MSH
      );

      expect(messages).toHaveLength(20);
      expect(messages[19]?.reason).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
    });

    // Against MSH and 25 required PIDs, a message of MSH alone lacks all 25.
    // The 21st edit is another missing segment, not an out-of-place one, so
    // the report stops at 20.
    it("reports 20 edits when the 21st is another missing segment", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            ...Array.from({ length: 25 }, () => ({
              name: "PID",
              optional: false,
              repeating: false,
              type: "segment" as const,
            })),
          ],
          id: "TEST",
        },
        MSH
      );

      expect(messages).toHaveLength(21);
      expect(messages[20]?.reason).toBe(
        "The message has 5 more missing or out-of-place segments; the rule reports the first 20."
      );
    });

    // Against MSH, 20 required PIDs, then PV1, the message MSH, PV1, XXX
    // lacks the 20 PIDs before PV1, and XXX is out of place after it. The
    // 20th edit is a missing PID; the 21st, XXX, does not stand where that
    // PID belongs, so it is counted, not reported.
    it("counts an out-of-place segment after the 20th edit's missing segment when it stands elsewhere", async () => {
      const messages = await lintAgainst(
        {
          elements: [
            { name: "MSH", optional: false, repeating: false, type: "segment" },
            ...Array.from({ length: 20 }, () => ({
              name: "PID",
              optional: false,
              repeating: false,
              type: "segment" as const,
            })),
            { name: "PV1", optional: false, repeating: false, type: "segment" },
          ],
          id: "TEST",
        },
        MSH,
        // PV1|1
        s("PV1", f("1")),
        // XXX|1
        s("XXX", f("1"))
      );

      expect(messages).toHaveLength(21);
      expect(messages[19]?.reason).toBe(
        "Segment `PID` is missing; the event schema requires it at this point."
      );
      expect(messages[20]?.reason).toBe(
        "The message has 1 more missing or out-of-place segment; the rule reports the first 20."
      );
    });

    // MSH and 999 OBX: 1,000 segments, repaired as any shorter message is.
    it("repairs a message of 1,000 segments", async () => {
      const messages = await lintAgainst(
        MSH_OBX_PV1,
        MSH,
        ...repeated(
          // OBX|1
          s("OBX", f("1")),
          999
        )
      );

      expect(reasons(messages)).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
      expect(messages[0]?.note).toBeUndefined();
    });

    // MSH, XXX, then 999 PID: 1,001 segments. XXX is the first that does not
    // fit, and PID is what the schema allows there.
    it("reports only the first segment that does not fit in a message of more than 1,000 segments", async () => {
      const tree = parseHL7v2(
        hl7(
          MSH,
          // XXX|1
          s("XXX", f("1")),
          ...repeated(
            // PID|1
            s("PID", f("1")),
            999
          )
        )
      );
      const [message, ...rest] = await run(tree, { definition: MSH_PID });

      expect(rest).toEqual([]);
      expect(message?.reason).toBe(
        "The segment is out of place; the event schema does not allow it at this point."
      );
      expect(message?.actual).toBe("XXX");
      expect(message?.expected).toEqual(["PID"]);
      expect(message?.ancestors).toEqual([tree, tree.children[1]]);
      expect(message?.note).toBe(
        "The message has 1,001 segments; above 1,000, the rule reports only the first segment that does not fit, not every missing or out-of-place segment."
      );
    });

    // MSH and 1,000 OBX: 1,001 segments, and the message stops where another
    // OBX or the required PV1 must follow.
    it("reports a message of more than 1,000 segments that ends early at its end, with the segment IDs valid there", async () => {
      const tree = parseHL7v2(
        hl7(
          MSH,
          ...repeated(
            // OBX|1
            s("OBX", f("1")),
            1000
          )
        )
      );
      const [message, ...rest] = await run(tree, { definition: MSH_OBX_PV1 });

      expect(rest).toEqual([]);
      expect(message?.reason).toBe(
        "The message ends before its event schema is complete; the event schema requires `OBX` or `PV1` next."
      );
      expect(message?.expected).toEqual(["OBX", "PV1"]);
      expect(message?.ancestors).toEqual([tree]);
      expect(message?.note).toBe(
        "The message has 1,001 segments; above 1,000, the rule reports only where the message ends, not every missing or out-of-place segment."
      );
    });
  });

  // With no `definition`, the event schema is the one MSH-9 names for the
  // version in MSH-12: MSH-9.3 (Message Structure) when it is valued, or else
  // the structure the version's event map gives MSH-9.1 and MSH-9.2. Each
  // message below is an ADT_A01 with no PV1, so a report of PV1 missing shows
  // the schema was found.
  describe("the event schema MSH-9 names", () => {
    it("uses MSH-9.3 and MSH-12", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A01", "ADT_A01"), f("2.5")),
            // EVN|A01
            s("EVN", f("A01")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // MSH-9.3 is empty, as in most v2.3 messages, which predate it.
    it("uses the event map when MSH-9.3 is empty", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A01"), f("2.5")),
            // EVN|A01
            s("EVN", f("A01")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A01"), f("2.3")),
            // EVN|A01
            s("EVN", f("A01")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // HL7v2 gives ADT^A04 the ADT_A01 message structure.
    it("uses the structure the event map gives an event that shares one", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A04"), f("2.5")),
            // EVN|A04
            s("EVN", f("A04")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // MSH-9.3 says ADT_A04, which is not a structure of its own; the store
    // resolves it to ADT_A01, as the event map does.
    it("uses MSH-9.3 when it is valued, even where the event map has another entry", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A04", "ADT_A04"), f("2.5")),
            // EVN|A04
            s("EVN", f("A04")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // MSH-12 is a VID composite: version ID, then internationalization code.
    it("reads the version from MSH-12.1 when MSH-12 has components (#489)", async () => {
      expect(
        reasons(
          await lint(
            msh(f("ADT", "A01", "ADT_A01"), f("2.5", "USA")),
            // EVN|A01
            s("EVN", f("A01")),
            // PID|1
            s("PID", f("1"))
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // In each case below no schema can be named, so the rule has nothing to
    // check the order against.
    it("reports nothing when MSH-12 is empty", async () => {
      expect(
        await lint(
          msh(f("ADT", "A01", "ADT_A01"), f()),
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });

    it("reports nothing when MSH-9 is empty", async () => {
      expect(
        await lint(
          msh(f(), f("2.5")),
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });

    it("reports nothing when MSH-9.3 names no bundled structure", async () => {
      expect(
        await lint(
          msh(f("ADT", "A01", "BOGUS_X99"), f("2.5")),
          // EVN|A01
          s("EVN", f("A01")),
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });

    it("reports nothing when the event map has no entry for MSH-9.1 and MSH-9.2", async () => {
      expect(
        await lint(
          msh(f("ZZZ", "Z99"), f("2.5")),
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });

    it("reports nothing for a message whose MSH has no fields", async () => {
      expect(
        await lint(
          MSH,
          // PID|1
          s("PID", f("1"))
        )
      ).toEqual([]);
    });
  });

  describe("the definition option", () => {
    // A bundled schema passed as an object is checked like one MSH-9 names.
    it("checks the message against the event schema it gives", async () => {
      const definition = await profiles.events.load("2.5", "ADT_A01");

      expect(
        reasons(
          await run(
            parseHL7v2(
              hl7(
                MSH,
                // EVN|A01
                s("EVN", f("A01")),
                // PID|1
                s("PID", f("1"))
              )
            ),
            {
              definition,
            }
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });

    // The function sees the message being checked and its file.
    it("checks the message against the event schema a function returns for it", async () => {
      const tree = parseHL7v2(
        hl7(
          MSH,
          // PV1|1
          s("PV1", f("1"))
        )
      );
      const file = new VFile();
      const seen: unknown[] = [];

      await unified()
        .use(hl7v2LintSegmentOrder, {
          definition: (context) => {
            seen.push(context.tree, context.file);
            return MSH_PID;
          },
        })
        .run(tree, file);

      expect(seen).toEqual([tree, file]);
      expect(reasons(file.messages)).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
        "The segment is out of place; the event schema does not allow it at this point.",
      ]);
    });

    it("awaits an event schema the function resolves asynchronously", async () => {
      expect(
        reasons(
          await run(
            parseHL7v2(
              hl7(
                MSH,
                // PV1|1
                s("PV1", f("1"))
              )
            ),
            {
              definition: async () => await Promise.resolve(MSH_PID_PV1),
            }
          )
        )
      ).toEqual([
        "Segment `PID` is missing; the event schema requires it at this point.",
      ]);
    });

    // The function returns nothing, so the rule uses the ADT_A01 that MSH-9
    // names, and reports the PV1 it lacks.
    it("uses the event schema MSH-9 names when the function returns none", async () => {
      expect(
        reasons(
          await run(
            parseHL7v2(
              hl7(
                msh(f("ADT", "A01", "ADT_A01"), f("2.5")),
                // EVN|A01
                s("EVN", f("A01")),
                // PID|1
                s("PID", f("1"))
              )
            ),
            { definition: () => {} }
          )
        )
      ).toEqual([
        "Segment `PV1` is missing; the event schema requires it at this point.",
      ]);
    });
  });
});
