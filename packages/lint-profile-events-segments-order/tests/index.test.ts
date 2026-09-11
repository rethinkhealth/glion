import { c, f, m, s } from "@glion/builder";
import type { Definition } from "@glion/profiles";
import { profiles } from "@glion/profiles";
import { unified } from "unified";
import { VFile } from "vfile";
import { describe, expect, it } from "vitest";

import hl7v2LintSegmentOrder from "../src";

/** Simple definition: MSH -> PID (both required) */
function simpleDef(): Definition {
  return {
    finals: new Set([2]),
    start: 0,
    transitions: new Map([
      [0, new Map([["MSH", 1]])],
      [1, new Map([["PID", 2]])],
    ]),
  };
}

/** Definition: MSH -> PID -> PV1 (all required) */
function threeSegmentDef(): Definition {
  return {
    finals: new Set([3]),
    start: 0,
    transitions: new Map([
      [0, new Map([["MSH", 1]])],
      [1, new Map([["PID", 2]])],
      [2, new Map([["PV1", 3]])],
    ]),
  };
}

describe("hl7v2LintSegmentOrder", () => {
  describe("valid messages", () => {
    it("accepts correct segment order", async () => {
      const tree = m(s("MSH"), s("PID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("accepts repeating segments", async () => {
      const definition: Definition = {
        finals: new Set([2]),
        start: 0,
        transitions: new Map([
          [0, new Map([["MSH", 1]])],
          [
            1,
            new Map([
              ["OBX", 1],
              ["END", 2],
            ]),
          ],
        ]),
      };

      const tree = m(s("MSH"), s("OBX"), s("OBX"), s("OBX"), s("END"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });
  });

  describe("invalid segment order", () => {
    it("reports unexpected segment", async () => {
      const tree = m(s("MSH"), s("INVALID"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: threeSegmentDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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
        .use(hl7v2LintSegmentOrder, { definition: simpleDef() })
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

      // Should resolve ADT_A01 via event map and validate — no resolution errors
      const resolutionErrors = file.messages.filter(
        (msg) =>
          msg.message.includes("missing version") ||
          msg.message.includes("unable to determine") ||
          msg.message.includes("no profile found")
      );
      expect(resolutionErrors).toHaveLength(0);
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

      // Should load profile from MSH fields — no resolution errors
      const resolutionErrors = file.messages.filter(
        (msg) =>
          msg.message.includes("missing version") ||
          msg.message.includes("no profile found")
      );
      expect(resolutionErrors).toHaveLength(0);
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

  describe("ADT_A60 segment order (PV2 must follow PV1)", () => {
    // ADT_A60 is "Adverse Reaction Message". PV2 (Patient Visit — Additional
    // Information) must always follow a PV1; the generated DFA previously
    // allowed a direct PID -> PV2 transition. See
    // `packages/profiles/src/profiles/v2.4/events/ADT_A60.ts`.
    const affectedVersions = ["2.4", "2.5", "2.5.1", "2.6", "2.7"];

    it("rejects PV2 directly after PID with no PV1 (v2.4)", async () => {
      const definition = await profiles.events.load("2.4", "ADT_A60");
      const tree = m(s("MSH"), s("EVN"), s("PID"), s("PV2"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0]?.message).toContain("Unexpected segment 'PV2'");
      // PV2 must not appear among the suggested next segments
      expect(invalidErrors[0]?.message).not.toMatch(/Expected:.*PV2/);
      expect(invalidErrors[0]?.message).toMatch(/PV1/);
    });

    it("accepts PV2 after PV1 (v2.4)", async () => {
      const definition = await profiles.events.load("2.4", "ADT_A60");
      const tree = m(s("MSH"), s("EVN"), s("PID"), s("PV1"), s("PV2"));
      const file = new VFile();

      await unified()
        .use(hl7v2LintSegmentOrder, { definition })
        .run(tree, file);

      expect(file.messages).toHaveLength(0);
    });

    it("rejects PV2 after PID across all affected versions", async () => {
      for (const version of affectedVersions) {
        const definition = await profiles.events.load(version, "ADT_A60");
        const tree = m(s("MSH"), s("EVN"), s("PID"), s("PV2"));
        const file = new VFile();

        await unified()
          .use(hl7v2LintSegmentOrder, { definition })
          .run(tree, file);

        const invalidErrors = file.messages.filter((msg) =>
          msg.message.includes("Unexpected segment")
        );
        expect(invalidErrors).toHaveLength(1);
        expect(invalidErrors[0]?.message).toContain("Unexpected segment 'PV2'");
        expect(invalidErrors[0]?.message).not.toMatch(/Expected:.*PV2/);
      }
    });

    it("accepts PV2 after PV1 across all affected versions", async () => {
      for (const version of affectedVersions) {
        const definition = await profiles.events.load(version, "ADT_A60");
        const tree = m(s("MSH"), s("EVN"), s("PID"), s("PV1"), s("PV2"));
        const file = new VFile();

        await unified()
          .use(hl7v2LintSegmentOrder, { definition })
          .run(tree, file);

        expect(file.messages).toHaveLength(0);
      }
    });

    it("end-to-end: rejects EVN PID PV2 via MSH-9.3 auto-resolution", async () => {
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
          f(c("ADT"), c("A60"), c("ADT_A60")),
          f(""),
          f(""),
          f("2.4")
        ),
        s("EVN"),
        s("PID"),
        s("PV2")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      const invalidErrors = file.messages.filter((msg) =>
        msg.message.includes("Unexpected segment")
      );
      expect(invalidErrors).toHaveLength(1);
      expect(invalidErrors[0]?.message).toContain("Unexpected segment 'PV2'");
    });

    it("end-to-end: accepts EVN PID PV1 PV2 via MSH-9.3 auto-resolution", async () => {
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
          f(c("ADT"), c("A60"), c("ADT_A60")),
          f(""),
          f(""),
          f("2.4")
        ),
        s("EVN"),
        s("PID"),
        s("PV1"),
        s("PV2")
      );
      const file = new VFile();

      await unified().use(hl7v2LintSegmentOrder).run(tree, file);

      expect(file.messages).toHaveLength(0);
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
