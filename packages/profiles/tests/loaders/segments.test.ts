import { loadSegments } from "../../src/loaders/segments";

describe("loadSegments", () => {
  it("loads segment definitions for v2.5", async () => {
    const def = await loadSegments("2.5");
    expect(def).toBeDefined();
    expect(def?.byId).toBeInstanceOf(Map);
    expect(def?.byId.size).toBeGreaterThan(0);
  });

  it("contains known segments with correct titles", async () => {
    const def = await loadSegments("2.5");
    expect(def?.byId.get("MSH")).toEqual({
      id: "MSH",
      title: "Message Header",
    });
    expect(def?.byId.get("PID")).toEqual({
      id: "PID",
      title: "Patient Identification",
    });
    expect(def?.byId.get("OBX")).toEqual({
      id: "OBX",
      title: "Observation/Result",
    });
  });

  it("does not contain Z-segments", async () => {
    const def = await loadSegments("2.5");
    expect(def?.byId.has("ZZZ")).toBe(false);
  });

  it("loads segments across versions", async () => {
    const v21 = await loadSegments("2.1");
    const v25 = await loadSegments("2.5");
    const v282 = await loadSegments("2.8.2");
    // Later versions have more segments
    expect(v21?.byId.size).toBeLessThan(v25?.byId.size ?? 0);
    expect(v25?.byId.size).toBeLessThan(v282?.byId.size ?? 0);
    // MSH exists in all versions
    expect(v21?.byId.has("MSH")).toBe(true);
    expect(v25?.byId.has("MSH")).toBe(true);
    expect(v282?.byId.has("MSH")).toBe(true);
  });

  it("resolves undefined for a version not bundled", async () => {
    expect(await loadSegments("99.99")).toBeUndefined();
  });

  it("returns the same definition on every call", async () => {
    expect(await loadSegments("2.5")).toBe(await loadSegments("2.5"));
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
      expect(def?.byId.size).toBeGreaterThan(0);
      expect(def?.byId.has("MSH")).toBe(true);
    }
  });
});
