import { runner } from "../src/automata/runner";
import { createLruCache } from "../src/cache/lru";
import { createProfiles } from "../src/profiles";
import { loadSegments } from "../src/stores/segments";

describe("createProfiles", () => {
  describe("events", () => {
    it("loads a DFA definition by version and id", async () => {
      const profiles = createProfiles();
      const def = await profiles.events.load("2.5", "ADT_A01");
      expect(def).toBeDefined();
      expect(def.start).toBe(0);
      expect(def.finals).toBeInstanceOf(Set);
      expect(def.transitions).toBeInstanceOf(Map);
      expect(def.alphabet?.has("MSH")).toBe(true);
    });

    it("resolves event aliases transparently", async () => {
      const profiles = createProfiles();
      const alias = await profiles.events.load("2.5", "ADT_A04");
      const canonical = await profiles.events.load("2.5", "ADT_A01");
      expect(alias.start).toBe(canonical.start);
      expect(alias.alphabet).toEqual(canonical.alphabet);
    });

    it("supports resolve: false to skip alias resolution", async () => {
      const profiles = createProfiles();
      await expect(
        profiles.events.load("2.5", "ADT_A04", { resolve: false })
      ).rejects.toThrow();
    });

    it("returns a Definition compatible with the runner", async () => {
      const profiles = createProfiles();
      const def = await profiles.events.load("2.5", "ADT_A01");
      const r = runner(def);
      r.consume("MSH");
      r.consume("EVN");
      r.consume("PID");
      r.consume("PV1");
      expect(r.accepted).toBe(true);
    });

    it("caches repeated loads", async () => {
      const profiles = createProfiles();
      const a = await profiles.events.load("2.5", "ACK");
      const b = await profiles.events.load("2.5", "ACK");
      expect(a).toBe(b);
    });

    it("throws for unknown profile", async () => {
      const profiles = createProfiles();
      await expect(
        profiles.events.load("2.5", "NONEXISTENT_ZZZ")
      ).rejects.toThrow();
    });

    it("loads across multiple versions", async () => {
      const profiles = createProfiles();
      const v21 = await profiles.events.load("2.1", "ADT_A01");
      const v25 = await profiles.events.load("2.5", "ADT_A01");
      const v282 = await profiles.events.load("2.8.2", "ADT_A01");
      expect(v21.start).toBe(0);
      expect(v25.start).toBe(0);
      expect(v282.start).toBe(0);
    });
  });

  describe("cache operations", () => {
    it("has() reflects cache state", async () => {
      const profiles = createProfiles();
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
      await profiles.events.load("2.5", "ACK");
      expect(profiles.events.has("2.5", "ACK")).toBe(true);
    });

    it("evict() removes a cached entry", async () => {
      const profiles = createProfiles();
      await profiles.events.load("2.5", "ACK");
      profiles.events.evict("2.5", "ACK");
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
    });

    it("events.reset() flushes only events", async () => {
      // With shared cache, events.reset() should not affect other stores.
      // Since fields/datatypes have empty manifests, we test via cache keys.
      const profiles = createProfiles();
      await profiles.events.load("2.5", "ACK");
      await profiles.events.load("2.1", "ACK");
      profiles.events.reset();
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
      expect(profiles.events.has("2.1", "ACK")).toBe(false);
    });

    it("profiles.reset() flushes all stores", async () => {
      const profiles = createProfiles();
      await profiles.events.load("2.5", "ACK");
      profiles.reset();
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
    });

    it("has() checks the raw key, not the resolved alias", async () => {
      const profiles = createProfiles();
      // ADT_A04 resolves to ADT_A01, so the cache key uses ADT_A01
      await profiles.events.load("2.5", "ADT_A04");
      expect(profiles.events.has("2.5", "ADT_A01")).toBe(true);
      expect(profiles.events.has("2.5", "ADT_A04")).toBe(false);
    });
  });

  describe("fields", () => {
    it("loads field definitions for PID v2.5", async () => {
      const profiles = createProfiles();
      const def = await profiles.fields.load("2.5", "PID");
      expect(def).toBeDefined();
      expect(def.segmentId).toBe("PID");
      expect(def.bySequence).toBeInstanceOf(Map);
      expect(def.bySequence.size).toBeGreaterThan(0);
      expect(def.requiredSequences).toBeInstanceOf(Set);
    });

    it("loads MSH with required fields and maxLength", async () => {
      const profiles = createProfiles();
      const def = await profiles.fields.load("2.5", "MSH");
      expect(def.segmentId).toBe("MSH");
      // MSH-1 and MSH-2 are typically required
      const msh1 = def.bySequence.get(1);
      expect(msh1).toBeDefined();
      expect(msh1?.id).toBe("MSH-1");
      expect(msh1?.datatype).toBeDefined();
      // maxLength is now enriched from HL7DB
      expect(msh1?.maxLength).toBeDefined();
      expectTypeOf(msh1?.maxLength).toBeNumber();
    });

    it("loads fields across versions", async () => {
      const profiles = createProfiles();
      const v21 = await profiles.fields.load("2.1", "PID");
      const v25 = await profiles.fields.load("2.5", "PID");
      const v282 = await profiles.fields.load("2.8.2", "PID");
      expect(v21.segmentId).toBe("PID");
      expect(v25.segmentId).toBe("PID");
      expect(v282.segmentId).toBe("PID");
    });

    it("throws for unknown segment", async () => {
      const profiles = createProfiles();
      await expect(profiles.fields.load("2.5", "ZZZ")).rejects.toThrow();
    });

    it("caches repeated loads", async () => {
      const profiles = createProfiles();
      const a = await profiles.fields.load("2.5", "PID");
      const b = await profiles.fields.load("2.5", "PID");
      expect(a).toBe(b);
    });
  });

  describe("datatypes", () => {
    it("loads a composite datatype (CWE) with title", async () => {
      const profiles = createProfiles();
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
      const profiles = createProfiles();
      const def = await profiles.datatypes.load("2.5", "ST");
      expect(def).toBeDefined();
      expect(def.id).toBe("ST");
      expect(def.kind).toBe("primitive");
      expect(def.componentsBySequence.size).toBe(0);
    });

    it("loads datatypes across versions", async () => {
      const profiles = createProfiles();
      const v21 = await profiles.datatypes.load("2.1", "CE");
      const v25 = await profiles.datatypes.load("2.5", "CE");
      expect(v21.id).toBe("CE");
      expect(v25.id).toBe("CE");
    });

    it("throws for unknown datatype", async () => {
      const profiles = createProfiles();
      await expect(profiles.datatypes.load("2.5", "ZZZZZ")).rejects.toThrow();
    });

    it("caches repeated loads", async () => {
      const profiles = createProfiles();
      const a = await profiles.datatypes.load("2.5", "CWE");
      const b = await profiles.datatypes.load("2.5", "CWE");
      expect(a).toBe(b);
    });
  });

  describe("shared cache across stores", () => {
    it("events.reset() does not affect fields cache", async () => {
      const profiles = createProfiles();
      await profiles.events.load("2.5", "ACK");
      await profiles.fields.load("2.5", "PID");
      profiles.events.reset();
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
      expect(profiles.fields.has("2.5", "PID")).toBe(true);
    });

    it("profiles.reset() flushes all stores", async () => {
      const profiles = createProfiles();
      await profiles.events.load("2.5", "ACK");
      await profiles.fields.load("2.5", "PID");
      await profiles.datatypes.load("2.5", "CWE");
      profiles.reset();
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
      expect(profiles.fields.has("2.5", "PID")).toBe(false);
      expect(profiles.datatypes.has("2.5", "CWE")).toBe(false);
    });
  });

  describe("cache configuration", () => {
    it("accepts cache: false to disable caching", async () => {
      const profiles = createProfiles({ cache: false });
      const def = await profiles.events.load("2.5", "ACK");
      expect(def.start).toBe(0);
      expect(profiles.events.has("2.5", "ACK")).toBe(false);
    });

    it("accepts CacheOptions for built-in LRU", async () => {
      const profiles = createProfiles({ cache: { maxEntries: 5 } });
      const def = await profiles.events.load("2.5", "ACK");
      expect(def.start).toBe(0);
    });

    it("accepts a custom Cache implementation", async () => {
      const cache = createLruCache({ maxEntries: 100 });
      const profiles = createProfiles({ cache });
      await profiles.events.load("2.5", "ACK");
      // Custom cache should have the namespaced key
      expect(cache.has("events:2.5/ACK")).toBe(true);
    });

    it("supports per-domain cache override", async () => {
      const customCache = createLruCache({ maxEntries: 100 });
      const profiles = createProfiles({
        events: { cache: customCache },
      });
      await profiles.events.load("2.5", "ACK");
      expect(customCache.has("events:2.5/ACK")).toBe(true);
    });
  });

  describe("tables", () => {
    it("loads table 0001 for v2.5", async () => {
      const profiles = createProfiles();
      const table = await profiles.tables.load("2.5", "0001");
      expect(table.id).toBe("0001");
      expect(table.description).toBe("Administrative Sex");
      expect(table.type).toBe("user");
      expect(table.codes).toBeInstanceOf(Map);
      expect(table.codes.has("F")).toBe(true);
      expect(table.codes.has("M")).toBe(true);
    });

    it("loads HL7-defined table", async () => {
      const profiles = createProfiles();
      const table = await profiles.tables.load("2.5", "0003");
      expect(table.type).toBe("hl7");
      expect(table.codes.size).toBeGreaterThan(100);
    });

    it("tables are versioned — v2.1 has fewer codes", async () => {
      const profiles = createProfiles();
      const t21 = await profiles.tables.load("2.1", "0001");
      const t25 = await profiles.tables.load("2.5", "0001");
      expect(t21.codes.size).toBeLessThan(t25.codes.size);
    });

    it("loads tables across versions", async () => {
      const profiles = createProfiles();
      const v21 = await profiles.tables.load("2.1", "0001");
      const v282 = await profiles.tables.load("2.8.2", "0001");
      expect(v21.id).toBe("0001");
      expect(v282.id).toBe("0001");
    });

    it("throws for unknown table", async () => {
      const profiles = createProfiles();
      await expect(profiles.tables.load("2.5", "ZZZZ")).rejects.toThrow();
    });

    it("caches repeated loads", async () => {
      const profiles = createProfiles();
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
      const profiles = createProfiles();
      const cs = await profiles.codeSystems.load("v2-0001");
      expect(cs.id).toBe("v2-0001");
      expect(cs.url).toBe("http://terminology.hl7.org/CodeSystem/v2-0001");
      expect(cs.codes).toBeInstanceOf(Map);
      expect(cs.codes.has("F")).toBe(true);
    });

    it("has more codes than any single version (cumulative)", async () => {
      const profiles = createProfiles();
      const cs = await profiles.codeSystems.load("v2-0001");
      const t282 = await profiles.tables.load("2.8.2", "0001");
      // UTG may have codes not in v2.8.2 (like "X" for Non-Binary)
      expect(cs.codes.size).toBeGreaterThanOrEqual(t282.codes.size);
    });

    it("loads a large code system", async () => {
      const profiles = createProfiles();
      const cs = await profiles.codeSystems.load("v2-0003");
      expect(cs.id).toBe("v2-0003");
      expect(cs.codes.size).toBeGreaterThan(100);
    });

    it("throws for unknown code system", async () => {
      const profiles = createProfiles();
      await expect(profiles.codeSystems.load("v2-ZZZZ")).rejects.toThrow();
    });

    it("caches repeated loads", async () => {
      const profiles = createProfiles();
      const a = await profiles.codeSystems.load("v2-0001");
      const b = await profiles.codeSystems.load("v2-0001");
      expect(a).toBe(b);
    });

    it("has() and evict() work correctly", async () => {
      const profiles = createProfiles();
      expect(profiles.codeSystems.has("v2-0001")).toBe(false);
      await profiles.codeSystems.load("v2-0001");
      expect(profiles.codeSystems.has("v2-0001")).toBe(true);
      profiles.codeSystems.evict("v2-0001");
      expect(profiles.codeSystems.has("v2-0001")).toBe(false);
    });

    it("reset() flushes code system cache", async () => {
      const profiles = createProfiles();
      await profiles.codeSystems.load("v2-0001");
      profiles.codeSystems.reset();
      expect(profiles.codeSystems.has("v2-0001")).toBe(false);
    });
  });
});
