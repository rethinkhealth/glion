import { c, f, m, s } from "@glion/builder";
import { profiles } from "@glion/profiles";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveDefinition } from "../src/resolve";

const loadSpy = vi.spyOn(profiles.events, "load");

afterEach(() => {
  loadSpy.mockClear();
});

describe("resolveDefinition", () => {
  describe("from MSH fields", () => {
    it("calls load with MSH-12 version and MSH-9.3 structure", async () => {
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
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.5", "ADT_A01");
      if (result.ok) {
        expect(result.definition.start).toBeDefined();
        expect(result.definition.transitions).toBeInstanceOf(Map);
        expect(result.definition.finals).toBeInstanceOf(Set);
        expect(result.definition.finals.size).toBeGreaterThan(0);
      }
    });

    it("calls load with correct version for different HL7 versions", async () => {
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
          f(c("ORU"), c("R01"), c("ORU_R01")),
          f(""),
          f(""),
          f("2.3.1")
        )
      );

      await resolveDefinition(tree);

      expect(loadSpy).toHaveBeenCalledWith("2.3.1", "ORU_R01");
    });

    it("does not call load when version is missing", async () => {
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
          f(c("ADT"), c("A01"), c("ADT_A01")) // No MSH-12
        )
      );

      const result = await resolveDefinition(tree);

      expect(loadSpy).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        ok: false,
        reason: "Cannot validate segment order: missing version (MSH-12)",
      });
    });

    it("falls back to event map when MSH-9.3 is missing", async () => {
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
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.5", "ADT_A01");
    });

    it("resolves alias via event map when MSH-9.3 is missing (ADT^A04 → ADT_A01)", async () => {
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
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.5", "ADT_A01");
    });

    it("fails when MSH-9.3 is missing and event map has no match", async () => {
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
        )
      );

      const result = await resolveDefinition(tree);

      expect(loadSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it("fails when MSH-9.1 and MSH-9.2 are also missing", async () => {
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

      const result = await resolveDefinition(tree);

      expect(loadSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it("falls back when MSH-9.3 is an empty string", async () => {
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
          f(c("ADT"), c("A01"), c("")), // MSH-9.3 present but empty
          f(""),
          f(""),
          f("2.5")
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.5", "ADT_A01");
    });

    it("fails when only MSH-9.1 is present (no trigger event)", async () => {
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
          f(c("ADT")), // Only MSH-9.1
          f(""),
          f(""),
          f("2.5")
        )
      );

      const result = await resolveDefinition(tree);

      expect(loadSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it("fails when only MSH-9.2 is present (no message code)", async () => {
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
          f(c(""), c("A01")), // Empty MSH-9.1, MSH-9.2 present
          f(""),
          f(""),
          f("2.5")
        )
      );

      const result = await resolveDefinition(tree);

      expect(loadSpy).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
    });

    it("uses wire value when MSH-9.3 is present (even if it differs from event map)", async () => {
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
          f(c("ADT"), c("A04"), c("ADT_A04")), // Wire says ADT_A04 even though event map says ADT_A01
          f(""),
          f(""),
          f("2.5")
        )
      );

      const result = await resolveDefinition(tree);

      // Wire value wins — load is called with ADT_A04, not ADT_A01
      expect(loadSpy).toHaveBeenCalledWith("2.5", "ADT_A04");
      // profiles.events.load resolves the alias internally, so it still succeeds
      expect(result.ok).toBe(true);
    });

    it("falls back to event map for v2.3 (pre-MSH-9.3 era)", async () => {
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
          f(c("ADT"), c("A08")), // No MSH-9.3, v2.3 alias: ADT_A08 → ADT_A01
          f(""),
          f(""),
          f("2.3")
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.3", "ADT_A01");
    });

    it("falls back to event map for v2.1 (1:1 mapping)", async () => {
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
          f("2.1")
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      expect(loadSpy).toHaveBeenCalledWith("2.1", "ADT_A01");
    });

    it("uses wire value when MSH-9.3 contains a nonexistent structure", async () => {
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
          f(c("ADT"), c("A01"), c("CUSTOM_X99")), // Nonexistent structure in wire
          f(""),
          f(""),
          f("2.5")
        )
      );

      const result = await resolveDefinition(tree);

      // Wire value wins — does NOT fall back to event map
      expect(loadSpy).toHaveBeenCalledWith("2.5", "CUSTOM_X99");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("CUSTOM_X99");
      }
    });
  });

  describe("failure cases", () => {
    it("fails when version is missing (even if MSH-9 components exist)", async () => {
      const tree = m(s("MSH"));

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("missing version");
      }
    });

    it("fails when profile does not exist", async () => {
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

      const result = await resolveDefinition(tree);

      expect(loadSpy).toHaveBeenCalledWith("2.5", "ZZZ_Z99");
      expect(result).toStrictEqual({
        ok: false,
        reason:
          "Cannot validate segment order: no profile found for ZZZ_Z99 (v2.5)",
      });
    });

    it("fails for unknown version", async () => {
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
          f("9.9.9")
        )
      );

      const result = await resolveDefinition(tree);

      expect(loadSpy).toHaveBeenCalledWith("9.9.9", "ADT_A01");
      expect(result).toStrictEqual({
        ok: false,
        reason:
          "Cannot validate segment order: no profile found for ADT_A01 (v9.9.9)",
      });
    });
  });

  describe("result type", () => {
    it("success result has ok: true and a valid Definition", async () => {
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
        )
      );

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Definition must have start, transitions, and finals
        expectTypeOf(result.definition.start).toBeNumber();
        expect(result.definition.transitions).toBeInstanceOf(Map);
        expect(result.definition.finals).toBeInstanceOf(Set);
        // Should not have a "reason" property
        expect(result).not.toHaveProperty("reason");
      }
    });

    it("failure result has ok: false and a non-empty reason string", async () => {
      const tree = m(s("MSH"));

      const result = await resolveDefinition(tree);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expectTypeOf(result.reason).toBeString();
        expect(result.reason.length).toBeGreaterThan(0);
        // Should not have a "definition" property
        expect(result).not.toHaveProperty("definition");
      }
    });
  });
});
