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

/**
 * MSH PATIENT { ORDER } [DSC], where PATIENT is `PID [PD1]`, ORDER is
 * `[ORC] OBR [{ RESULT }]`, and RESULT is `OBX [{ NTE }]`.
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
          definition: async () => await Promise.resolve(MSH_PID_PV1),
        })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
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

    it("reports each segment out of place next to the required one it displaces", async () => {
      const tree = m(s("MSH"), s("WRONG1"), s("WRONG2"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages.map((message) => message.reason)).toEqual([
        "Missing segment 'PID' (before 'WRONG1')",
        "Unexpected segment 'WRONG1' (after 'MSH')",
        "Missing segment 'PV1' (before 'WRONG2')",
        "Unexpected segment 'WRONG2' (after 'WRONG1')",
      ]);
    });
  });

  describe("reports in groups", () => {
    const lintLab = async (...segmentIds: string[]) => {
      const file = new VFile();
      await unified()
        .use(hl7v2LintSegmentOrder, { definition: LAB })
        .run(m(...segmentIds.map((id) => s(id))), file);
      return file.messages.map((message) => message.reason);
    };

    it("names the groups a missing segment belongs in", async () => {
      expect(await lintLab("MSH", "OBR", "OBX")).toEqual([
        "Missing segment 'PID' (before 'OBR', in PATIENT)",
      ]);
      expect(await lintLab("MSH", "PID", "OBX", "OBX")).toEqual([
        "Missing segment 'OBR' (before 'OBX', in ORDER)",
      ]);
    });

    it("names the groups of the segment before an unexpected one", async () => {
      expect(await lintLab("MSH", "PID", "OBR", "OBX", "PV1", "OBX")).toEqual([
        "Unexpected segment 'PV1' (after 'OBX', in ORDER > RESULT)",
      ]);
    });

    it("reads a segment that starts a new group as that group's, with its first segment missing", async () => {
      expect(await lintLab("MSH", "PID", "OBR", "OBX", "ORC", "OBX")).toEqual([
        "Missing segment 'OBR' (before 'OBX', in ORDER)",
      ]);
    });
  });

  describe("missing at the end", () => {
    it("reports a required segment missing at the end", async () => {
      const tree = m(s("MSH"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      expect(file.messages).toMatchObject([
        {
          message: "Missing segment 'PID' (at the end)",
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

  describe("report fields", () => {
    const positioned = (name: string, line: number) => {
      const node = s(name);
      node.position = {
        end: { column: 4, line, offset: (line - 1) * 5 + 3 },
        start: { column: 1, line, offset: (line - 1) * 5 },
      };
      return node;
    };

    it("places a missing segment at the start of the segment it comes before, with expected its ID", async () => {
      const msh = positioned("MSH", 1);
      const pv1 = positioned("PV1", 2);
      const tree = m(msh, pv1);
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      const [missing] = file.messages;
      expect(missing?.reason).toBe("Missing segment 'PID' (before 'PV1')");
      expect(missing?.place).toStrictEqual(pv1.position?.start);
      expect(missing?.ancestors).toStrictEqual([tree]);
      expect(missing?.expected).toStrictEqual(["PID"]);
      expect(missing?.actual).toBeUndefined();
    });

    it("places a missing segment at the end of the message after the last segment", async () => {
      const tree = m(positioned("MSH", 1));
      tree.position = {
        end: { column: 4, line: 1, offset: 3 },
        start: { column: 1, line: 1, offset: 0 },
      };
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      const [missing] = file.messages;
      expect(missing?.reason).toBe("Missing segment 'PID' (at the end)");
      expect(missing?.place).toStrictEqual(tree.position.end);
      expect(missing?.ancestors).toStrictEqual([tree]);
    });

    it("gives a missing segment the ancestors of the point it goes at", async () => {
      const pv1 = s("PV1");
      const patient = g("PATIENT", pv1);
      const tree = m(s("MSH"), patient);
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID_PV1 })
        .run(tree, file);

      expect(file.messages[0]?.ancestors).toStrictEqual([tree, patient]);
    });

    it("places an unexpected segment on itself, with actual its ID", async () => {
      const invalid = positioned("INVALID", 2);
      const tree = m(positioned("MSH", 1), invalid);
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: MSH_PID })
        .run(tree, file);

      const unexpected = file.messages.find(
        (message) => message.actual !== undefined
      );
      expect(unexpected?.reason).toBe(
        "Unexpected segment 'INVALID' (after 'MSH')"
      );
      expect(unexpected?.place).toStrictEqual(invalid.position);
      expect(unexpected?.ancestors).toStrictEqual([tree, invalid]);
      expect(unexpected?.actual).toBe("INVALID");
      expect(unexpected?.expected).toBeUndefined();
    });

    it("reports without a place when the segments have no position", async () => {
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
