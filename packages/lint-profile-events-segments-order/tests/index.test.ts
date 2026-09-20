import { c, f, g, m, s } from "@glion/builder";
import { compileStructure, profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../src";

/** MSH, then PID, both required. */
const simpleProgram = () =>
  compileStructure({
    elements: [
      { name: "MSH", optional: false, repeating: false, type: "segment" },
      { name: "PID", optional: false, repeating: false, type: "segment" },
    ],
    id: "TEST",
  });

/** MSH, PID, then PV1, all required. */
const threeSegmentProgram = () =>
  compileStructure({
    elements: [
      { name: "MSH", optional: false, repeating: false, type: "segment" },
      { name: "PID", optional: false, repeating: false, type: "segment" },
      { name: "PV1", optional: false, repeating: false, type: "segment" },
    ],
    id: "TEST",
  });

describe("hl7v2LintSegmentOrder", () => {
  describe("valid messages", () => {
    it("accepts correct segment order", async () => {
      const tree = m(s("MSH"), s("PID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("accepts repeating segments", async () => {
      const program = compileStructure({
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          { name: "OBX", optional: true, repeating: true, type: "segment" },
          { name: "END", optional: false, repeating: false, type: "segment" },
        ],
        id: "TEST",
      });

      const tree = m(s("MSH"), s("OBX"), s("OBX"), s("OBX"), s("END"));
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder, { program }).run(tree, file);

      expect(file.messages).toHaveLength(0);
    });
  });

  describe("grouped messages", () => {
    it("validates segments nested in groups in document order", async () => {
      const tree = m(s("MSH"), g("PATIENT", s("PID"), g("VISIT", s("PV1"))));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: threeSegmentProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("reports an unexpected segment nested in a group", async () => {
      const tree = m(s("MSH"), g("PATIENT", s("PV1"), s("PID")));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: threeSegmentProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.message).toBe(
        "Unexpected segment 'PV1'. Expected: PID"
      );
    });
  });

  describe("invalid segment order", () => {
    it("reports unexpected segment", async () => {
      const tree = m(s("MSH"), s("INVALID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "Unexpected segment 'INVALID'. Expected: PID",
        ruleId: "segment-order",
        source: "hl7v2-lint",
      });
    });

    it("reports segment with empty name", async () => {
      const tree = m(s("MSH"), s(""));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        ruleId: "segment-order",
        source: "hl7v2-lint",
      });
      expect(file.messages[0]?.message).toContain("empty segment name");
    });

    it("reports segment with undefined name", async () => {
      const seg = s("MSH");
      const unnamed = s("placeholder");
      // oxlint-disable-next-line typescript/no-explicit-any
      (unnamed as any).name = undefined;

      const tree = m(seg, unnamed);
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        ruleId: "segment-order",
        source: "hl7v2-lint",
      });
      expect(file.messages[0]?.message).toContain("empty segment name");
    });

    it("stops at first invalid segment", async () => {
      const tree = m(s("MSH"), s("WRONG1"), s("WRONG2"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: threeSegmentProgram() })
        .run(tree, file);

      // Only reports the first invalid segment
      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.message).toContain("WRONG1");
    });
  });

  describe("premature end", () => {
    it("reports missing required segments", async () => {
      const tree = m(s("MSH"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]).toMatchObject({
        message: "Message ended prematurely. Expected: PID",
        ruleId: "segment-order",
        source: "hl7v2-lint",
      });
    });

    it("reports for empty message", async () => {
      const tree = m();
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.message).toContain(
        "Message ended prematurely. Expected: MSH"
      );
    });
  });

  describe("position tracking", () => {
    it("attaches segment position to error", async () => {
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
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.place).toStrictEqual({
        end: { column: 20, line: 2, offset: 29 },
        start: { column: 1, line: 2, offset: 10 },
      });
    });

    it("handles segment without position gracefully", async () => {
      const tree = m(s("MSH"), s("INVALID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { program: simpleProgram() })
        .run(tree, file);

      expect(file.messages).toHaveLength(1);
      expect(file.messages[0]?.place).toBeUndefined();
    });
  });

  describe("auto-resolution", () => {
    it("silently skips when both version and structure are missing", async () => {
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

      // ADT_A01 requires PV1 after PID: the report proves the structure loaded.
      expect(file.messages.map((message) => message.reason)).toEqual([
        expect.stringMatching(/^Message ended prematurely\. Expected: .*PV1/),
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

    it("silently skips when structure is present but version is missing", async () => {
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

      // ADT_A01 requires PV1 after PID: the report proves the structure loaded.
      expect(file.messages.map((message) => message.reason)).toEqual([
        expect.stringMatching(/^Message ended prematurely\. Expected: .*PV1/),
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

    it("validates alias event via fallback (ADT^A04 uses ADT_A01 structure)", async () => {
      // ADT_A04 maps to ADT_A01 structure — MSH -> EVN -> PID is valid start
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

    it("wire value wins: nonexistent MSH-9.3 structure skips gracefully", async () => {
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
      const { program } = await profiles.events.load("2.5", "ADT_A01");

      // Valid start of ADT_A01: MSH -> EVN -> PID
      const tree = m(s("MSH"), s("EVN"), s("PID"));
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder, { program }).run(tree, file);

      // MSH -> EVN -> PID is valid; may report premature end but no invalid segments
      const invalidSegmentErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidSegmentErrors).toHaveLength(0);
    });

    it("rejects wrong segment order in ADT_A01", async () => {
      const { program } = await profiles.events.load("2.5", "ADT_A01");

      // PID before EVN should be invalid in ADT_A01
      const tree = m(s("MSH"), s("PID"), s("EVN"));
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder, { program }).run(tree, file);

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
