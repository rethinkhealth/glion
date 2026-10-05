import { profiles } from "../src/profiles";
import { runner } from "../src/runner";
import { loadSegments } from "../src/stores/segments";

describe("profiles", () => {
  describe("events", () => {
    it("loads an event schema by version and id", async () => {
      const def = await profiles.events.load("2.5", "ADT_A01");
      expect(def.id).toBe("ADT_A01");
      expect(def.elements[0]).toEqual({
        name: "MSH",
        optional: false,
        repeating: false,
        type: "segment",
      });
    });

    it("resolves event aliases transparently", async () => {
      const alias = await profiles.events.load("2.5", "ADT_A04");
      const canonical = await profiles.events.load("2.5", "ADT_A01");
      expect(alias).toBe(canonical);
    });

    it("supports resolve: false to skip alias resolution", async () => {
      await expect(
        profiles.events.load("2.5", "ADT_A04", { resolve: false })
      ).rejects.toThrow();
    });

    it("returns a schema the runner validates against", async () => {
      const def = await profiles.events.load("2.5", "ADT_A01");
      expect(runner(def, ["MSH", "EVN", "PID", "PV1"]).type).toBe("matched");
    });

    it("resolves the same value for repeated loads", async () => {
      const a = await profiles.events.load("2.5", "ACK");
      const b = await profiles.events.load("2.5", "ACK");
      expect(a).toBe(b);
    });

    it("throws for unknown profile", async () => {
      await expect(
        profiles.events.load("2.5", "NONEXISTENT_ZZZ")
      ).rejects.toThrow();
    });

    it("loads across multiple versions", async () => {
      const v21 = await profiles.events.load("2.1", "ADT_A01");
      const v25 = await profiles.events.load("2.5", "ADT_A01");
      const v282 = await profiles.events.load("2.8.2", "ADT_A01");
      expect(v21.id).toBe("ADT_A01");
      expect(v25.id).toBe("ADT_A01");
      expect(v282.id).toBe("ADT_A01");
    });
  });

  describe("fields", () => {
    it("loads field definitions for PID v2.5", async () => {
      const def = await profiles.fields.load("2.5", "PID");
      expect(def).toBeDefined();
      expect(def.segmentId).toBe("PID");
      expect(def.bySequence).toBeInstanceOf(Map);
      expect(def.bySequence.size).toBeGreaterThan(0);
      expect(def.requiredSequences).toBeInstanceOf(Set);
    });

    it("loads MSH with required fields and maxLength", async () => {
      const def = await profiles.fields.load("2.5", "MSH");
      expect(def.segmentId).toBe("MSH");
      // MSH-1 and MSH-2 are typically required
      const msh1 = def.bySequence.get(1);
      expect(msh1).toBeDefined();
      expect(msh1?.id).toBe("MSH-1");
      expect(msh1?.datatype).toBeDefined();
      // maxLength is now enriched from HL7DB
      expect(msh1?.maxLength).toBeDefined();
      expect(typeof msh1?.maxLength).toBe("number");
    });

    it("loads fields across versions", async () => {
      const v21 = await profiles.fields.load("2.1", "PID");
      const v25 = await profiles.fields.load("2.5", "PID");
      const v282 = await profiles.fields.load("2.8.2", "PID");
      expect(v21.segmentId).toBe("PID");
      expect(v25.segmentId).toBe("PID");
      expect(v282.segmentId).toBe("PID");
    });

    it("throws for unknown segment", async () => {
      await expect(profiles.fields.load("2.5", "ZZZ")).rejects.toThrow();
    });

    it("resolves the same value for repeated loads", async () => {
      const a = await profiles.fields.load("2.5", "PID");
      const b = await profiles.fields.load("2.5", "PID");
      expect(a).toBe(b);
    });
  });

  describe("datatypes", () => {
    it("loads a composite datatype (CWE) with title", async () => {
      const def = await profiles.datatypes.load("2.5", "CWE");
      expect(def).toBeDefined();
      expect(def.id).toBe("CWE");
      expect(def.version).toBe("2.5");
      expect(def.kind).toBe("composite");
      expect(def.componentsBySequence).toBeInstanceOf(Map);
      expect(def.componentsBySequence.size).toBeGreaterThan(0);
      // title is now enriched from HL7DB
      expect(def.title).toBeDefined();
      expect(def.title).toBe("Coded with Exceptions");
    });

    it("loads a primitive datatype (ST) with no components", async () => {
      const def = await profiles.datatypes.load("2.5", "ST");
      expect(def).toBeDefined();
      expect(def.id).toBe("ST");
      expect(def.kind).toBe("primitive");
      expect(def.componentsBySequence.size).toBe(0);
    });

    it("loads datatypes across versions", async () => {
      const v21 = await profiles.datatypes.load("2.1", "CE");
      const v25 = await profiles.datatypes.load("2.5", "CE");
      expect(v21.id).toBe("CE");
      expect(v25.id).toBe("CE");
    });

    it("throws for unknown datatype", async () => {
      await expect(profiles.datatypes.load("2.5", "ZZZZZ")).rejects.toThrow();
    });

    it("resolves the same value for repeated loads", async () => {
      const a = await profiles.datatypes.load("2.5", "CWE");
      const b = await profiles.datatypes.load("2.5", "CWE");
      expect(a).toBe(b);
    });
  });

  describe("tables", () => {
    it("loads table 0001 for v2.5", async () => {
      const table = await profiles.tables.load("2.5", "0001");
      expect(table.id).toBe("0001");
      expect(table.description).toBe("Administrative Sex");
      expect(table.type).toBe("user");
      expect(table.codes).toBeInstanceOf(Map);
      expect(table.codes.has("F")).toBe(true);
      expect(table.codes.has("M")).toBe(true);
    });

    it("loads HL7-defined table", async () => {
      const table = await profiles.tables.load("2.5", "0003");
      expect(table.type).toBe("hl7");
      expect(table.codes.size).toBeGreaterThan(100);
    });

    it("tables are versioned — v2.1 has fewer codes", async () => {
      const t21 = await profiles.tables.load("2.1", "0001");
      const t25 = await profiles.tables.load("2.5", "0001");
      expect(t21.codes.size).toBeLessThan(t25.codes.size);
    });

    it("loads tables across versions", async () => {
      const v21 = await profiles.tables.load("2.1", "0001");
      const v282 = await profiles.tables.load("2.8.2", "0001");
      expect(v21.id).toBe("0001");
      expect(v282.id).toBe("0001");
    });

    it("throws for unknown table", async () => {
      await expect(profiles.tables.load("2.5", "ZZZZ")).rejects.toThrow();
    });

    it("resolves the same value for repeated loads", async () => {
      const a = await profiles.tables.load("2.5", "0001");
      const b = await profiles.tables.load("2.5", "0001");
      expect(a).toBe(b);
    });
  });

  describe("loadSegments", () => {
    it("loads segment definitions for v2.5", async () => {
      const def = await loadSegments("2.5");
      expect(def).toBeDefined();
      expect(def.byId).toBeInstanceOf(Map);
      expect(def.byId.size).toBeGreaterThan(0);
    });

    it("contains known segments with correct titles", async () => {
      const def = await loadSegments("2.5");
      expect(def.byId.get("MSH")).toEqual({
        id: "MSH",
        title: "Message Header",
      });
      expect(def.byId.get("PID")).toEqual({
        id: "PID",
        title: "Patient Identification",
      });
      expect(def.byId.get("OBX")).toEqual({
        id: "OBX",
        title: "Observation/Result",
      });
    });

    it("does not contain Z-segments", async () => {
      const def = await loadSegments("2.5");
      expect(def.byId.has("ZZZ")).toBe(false);
    });

    it("loads segments across versions", async () => {
      const v21 = await loadSegments("2.1");
      const v25 = await loadSegments("2.5");
      const v282 = await loadSegments("2.8.2");
      // Later versions have more segments
      expect(v21.byId.size).toBeLessThan(v25.byId.size);
      expect(v25.byId.size).toBeLessThan(v282.byId.size);
      // MSH exists in all versions
      expect(v21.byId.has("MSH")).toBe(true);
      expect(v25.byId.has("MSH")).toBe(true);
      expect(v282.byId.has("MSH")).toBe(true);
    });

    it("throws for unknown version", async () => {
      await expect(loadSegments("99.99")).rejects.toThrow(
        "Unknown segments profile: v99.99"
      );
    });

    it("loads all supported versions", async () => {
      const versions = [
        "2.1",
        "2.2",
        "2.3",
        "2.3.1",
        "2.4",
        "2.5",
        "2.5.1",
        "2.6",
        "2.7",
        "2.7.1",
        "2.8",
        "2.8.1",
        "2.8.2",
      ];
      for (const version of versions) {
        const def = await loadSegments(version);
        expect(def.byId.size).toBeGreaterThan(0);
        expect(def.byId.has("MSH")).toBe(true);
      }
    });
  });

  describe("codeSystems (UTG)", () => {
    it("loads UTG code system v2-0001", async () => {
      const cs = await profiles.codeSystems.load("v2-0001");
      expect(cs.id).toBe("v2-0001");
      expect(cs.url).toBe("http://terminology.hl7.org/CodeSystem/v2-0001");
      expect(cs.codes).toBeInstanceOf(Map);
      expect(cs.codes.has("F")).toBe(true);
    });

    it("has more codes than any single version (cumulative)", async () => {
      const cs = await profiles.codeSystems.load("v2-0001");
      const t282 = await profiles.tables.load("2.8.2", "0001");
      // UTG may have codes not in v2.8.2 (like "X" for Non-Binary)
      expect(cs.codes.size).toBeGreaterThanOrEqual(t282.codes.size);
    });

    it("loads a large code system", async () => {
      const cs = await profiles.codeSystems.load("v2-0003");
      expect(cs.id).toBe("v2-0003");
      expect(cs.codes.size).toBeGreaterThan(100);
    });

    it("throws for unknown code system", async () => {
      await expect(profiles.codeSystems.load("v2-ZZZZ")).rejects.toThrow();
    });

    it("resolves the same value for repeated loads", async () => {
      const a = await profiles.codeSystems.load("v2-0001");
      const b = await profiles.codeSystems.load("v2-0001");
      expect(a).toBe(b);
    });
  });
});
