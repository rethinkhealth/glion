import { c, f, g, m, s } from "@glion/builder";
import type { EventSchema } from "@glion/profiles";
import { profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../src";

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

describe("hl7v2LintSegmentOrder", () => {
  describe("valid messages", () => {
    it("accepts correct segment order", async () => {
      const tree = m(s("MSH"), s("PID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("accepts repeating segments", async () => {
      const definition: EventSchema = {
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          { name: "OBX", optional: true, repeating: true, type: "segment" },
          { name: "END", optional: false, repeating: false, type: "segment" },
        ],
        id: "TEST",
      };

      const tree = m(s("MSH"), s("OBX"), s("OBX"), s("OBX"), s("END"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });
  });

  describe("grouped messages", () => {
    it("validates segments nested in groups in document order", async () => {
      const tree = m(s("MSH"), g("PATIENT", s("PID"), g("VISIT", s("PV1"))));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("reports segments out of order nested in a group", async () => {
      const tree = m(s("MSH"), g("PATIENT", s("PV1"), s("PID")));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before 'PV1')",
        "Unexpected segment 'PID' (after 'PV1')",
      ]);
    });
  });

  describe("definition function", () => {
    it("validates against the schema the function returns for the message", async () => {
      const tree = m(s("MSH"), s("PV1"));
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
      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before 'PV1')",
        "Unexpected segment 'PV1' (after 'MSH')",
      ]);
    });

    it("awaits a schema the function resolves asynchronously", async () => {
      const tree = m(s("MSH"), s("PV1"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, {
          definition: () => profiles.events.load("2.5", "ADT_A01"),
        })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'EVN' (before 'PV1')",
        "Missing segment 'PID' (before 'PV1')",
      ]);
    });

    it("uses the schema MSH-9 names when the function returns no schema", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01"), c("ADT_A01")),
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: () => {} })
        .run(tree, file);

      // ADT_A01 requires PV1 after PID: the report proves the fallback loaded.
      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PV1' (at the end)",
      ]);
    });
  });

  describe("invalid segment order", () => {
    it("reports a segment in place of a required one as unexpected, and the required one as missing", async () => {
      const tree = m(s("MSH"), s("INVALID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages).toMatchObject([
        {
          message: "Missing segment 'PID' (before 'INVALID')",
          ruleId: "segment-order",
          source: "hl7v2-lint",
        },
        {
          message: "Unexpected segment 'INVALID' (after 'MSH')",
          ruleId: "segment-order",
          source: "hl7v2-lint",
        },
      ]);
    });

    it("reports a segment with an empty ID as unexpected", async () => {
      const tree = m(s("MSH"), s(""));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before '')",
        "Unexpected segment '' (after 'MSH')",
      ]);
    });

    it("reports a malformed segment ID as unexpected, and the segment it stands for as missing", async () => {
      const tree = m(s("MSH"), s("PIDX"), s("PV1"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before 'PIDX')",
        "Unexpected segment 'PIDX' (after 'MSH')",
      ]);
    });

    it("reports each missing and each unexpected segment, not only the first", async () => {
      const tree = m(s("MSH"), s("WRONG1"), s("WRONG2"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before 'WRONG1')",
        "Missing segment 'PV1' (before 'WRONG1')",
        "Unexpected segment 'WRONG1' (after 'MSH')",
        "Unexpected segment 'WRONG2' (after 'WRONG1')",
      ]);
    });
  });

  describe("reports in groups", () => {
    const lintOru = async (...segmentIds: string[]) => {
      const schema = await profiles.events.load("2.5", "ORU_R01");
      const file = new VFile();
      await unified()
        .use(hl7v2LintSegmentOrder, { definition: schema })
        .run(m(...segmentIds.map((id) => s(id))), file);
      return file.messages.map((message) => message.reason);
    };

    it("names the groups a missing segment belongs in", async () => {
      expect(await lintOru("MSH", "PID", "OBX", "OBX")).toEqual([
        "Missing segment 'OBR' (before 'OBX', in PATIENT_RESULT > ORDER_OBSERVATION)",
      ]);
    });

    it("names the groups of the segment before an unexpected one", async () => {
      expect(await lintOru("MSH", "PID", "OBR", "OBX", "PV1", "OBX")).toEqual([
        "Unexpected segment 'PV1' (after 'OBX', in PATIENT_RESULT > ORDER_OBSERVATION > OBSERVATION)",
      ]);
    });

    it("reads a segment that starts a new group as that group's, with its first segment missing", async () => {
      expect(await lintOru("MSH", "PID", "OBR", "OBX", "ORC", "OBX")).toEqual([
        "Missing segment 'OBR' (before 'OBX', in PATIENT_RESULT > ORDER_OBSERVATION)",
      ]);
    });
  });

  describe("missing at the end", () => {
    it("reports a required segment missing at the end, on the message", async () => {
      const tree = m(s("MSH"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages).toMatchObject([
        {
          message: "Missing segment 'PID' (at the end)",
          place: tree.position,
          ruleId: "segment-order",
          source: "hl7v2-lint",
        },
      ]);
    });

    it("reports every required segment of an empty message as missing", async () => {
      const tree = m();
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'MSH' (at the end)",
        "Missing segment 'PID' (at the end)",
      ]);
    });
  });

  describe("position tracking", () => {
    it("places a missing segment's report on the segment it comes before, and an unexpected segment's on itself", async () => {
      const mshSegment = s("MSH");
      mshSegment.position = {
        end: { column: 10, line: 1, offset: 9 },
        start: { column: 1, line: 1, offset: 0 },
      };

      const invalidSegment = s("INVALID");
      invalidSegment.position = {
        end: { column: 20, line: 2, offset: 29 },
        start: { column: 1, line: 2, offset: 10 },
      };

      const tree = m(mshSegment, invalidSegment);
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages.map((message) => message.place)).toStrictEqual([
        invalidSegment.position,
        invalidSegment.position,
      ]);
    });

    it("handles segment without position gracefully", async () => {
      const tree = m(s("MSH"), s("INVALID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages.map((message) => message.place)).toStrictEqual([
        undefined,
        undefined,
      ]);
    });
  });

  describe("auto-resolution", () => {
    it("silently skips when both version and schema are missing", async () => {
      const tree = m(s("MSH"), s("PID"));
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("resolves via event map when MSH-9.3 is missing but MSH-9.1 and MSH-9.2 are present", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01")), // MSH-9.1 and MSH-9.2 only, no MSH-9.3
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      // ADT_A01 requires PV1 after PID: the report proves the schema loaded.
      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PV1' (at the end)",
      ]);
    });

    it("silently skips when MSH-9 components are all missing", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""), // Empty MSH-9
          f(""),
          f(""),
          f("2.5")
        )
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("silently skips when schema is present but version is missing", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01"), c("ADT_A01")) // MSH-9.3 present but no MSH-12
        )
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("silently skips when profile is not found", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ZZZ"), c("Z99"), c("ZZZ_Z99")),
          f(""),
          f(""),
          f("2.5")
        )
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("loads profile from MSH-9.3 and MSH-12", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01"), c("ADT_A01")),
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      // ADT_A01 requires PV1 after PID: the report proves the schema loaded.
      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PV1' (at the end)",
      ]);
    });
  });

  describe("event map fallback integration", () => {
    it("detects wrong segment order via event map fallback (no MSH-9.3)", async () => {
      // PID before EVN is invalid for ADT_A01
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01")), // No MSH-9.3
          f(""),
          f(""),
          f("2.5")
        ),
        s("PID"),
        s("EVN")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0]?.message).toContain("PID");
    });

    it("validates alias event via fallback (ADT^A04 uses ADT_A01 schema)", async () => {
      // ADT_A04 maps to ADT_A01 schema — MSH -> EVN -> PID is valid start
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A04")), // No MSH-9.3, alias event
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(0);
    });

    it("validates v2.3 message without MSH-9.3", async () => {
      // ADT_A01 in v2.3: MSH -> EVN -> PID is valid start
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01")), // No MSH-9.3 — normal for v2.3
          f(""),
          f(""),
          f("2.3")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(0);
    });

    it("silently skips when MSH-9.3 is absent and event is unknown", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ZZZ"), c("Z99")), // No MSH-9.3, unknown event
          f(""),
          f(""),
          f("2.5")
        ),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      // Cannot resolve — should skip silently
      expect(file.messages).toHaveLength(0);
    });

    it("wire value wins: uses MSH-9.3 even when it differs from event map", async () => {
      // ADT^A04 with MSH-9.3 = "ADT_A04" — wire value wins, load resolves alias internally
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A04"), c("ADT_A04")),
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(0);
    });

    it("wire value wins: nonexistent MSH-9.3 schema skips gracefully", async () => {
      const tree = m(
        s(
          "MSH",
          f("|"),
          f("^~\\&"),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(""),
          f(c("ADT"), c("A01"), c("BOGUS_X99")), // Wire value is nonsense
          f(""),
          f(""),
          f("2.5")
        ),
        s("EVN"),
        s("PID")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      // Profile not found — should skip silently, not crash
      expect(
        file.messages.filter((msg) =>
          msg.message.includes("Unexpected segment")
        )
      ).toHaveLength(0);
    });
  });

  describe("integration with real profiles", () => {
    it("validates ADT_A01 segment order", async () => {
      const definition = await profiles.events.load("2.5", "ADT_A01");

      // Valid start of ADT_A01: MSH -> EVN -> PID
      const tree = m(s("MSH"), s("EVN"), s("PID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      // MSH -> EVN -> PID is valid; may report premature end but no invalid segments
      const invalidSegmentErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidSegmentErrors).toHaveLength(0);
    });

    it("rejects wrong segment order in ADT_A01", async () => {
      const definition = await profiles.events.load("2.5", "ADT_A01");

      // PID before EVN should be invalid in ADT_A01
      const tree = m(s("MSH"), s("PID"), s("EVN"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0]?.message).toContain("PID");
    });
  });

  // https://github.com/rethinkhealth/hl7v2/issues/489
  it("validates correctly when MSH-12 is composite VID — #489", async () => {
    function mshVid(version: string) {
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
        f(c("ADT"), c("A01"), c("ADT_A01")),
        f("MSG001"),
        f("P"),
        f(c(version), c("USA"), c("ISO")) // VID composite
      );
    }

    // PID before EVN is wrong order for ADT_A01 — should trigger validation
    const tree = m(mshVid("2.5"), s("PID"), s("EVN"));
    const file = new VFile();

    await unified().use(hl7v2LintSegmentOrder).run(tree, file);

    // The rule must actually run and find the segment order violation
    const errors = file.messages.filter(
      (msg) => msg.ruleId === "segment-order"
    );
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });
});
