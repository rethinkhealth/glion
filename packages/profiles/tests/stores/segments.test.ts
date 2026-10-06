import { loadSegments } from "../../src/stores/segments";

const VERSIONS = [
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

describe("loadSegments", () => {
  it("loads the segments of a version, keyed by segment ID", async () => {
    const segments = await loadSegments("2.5");

    expect(segments?.byId.get("MSH")).toEqual({
      id: "MSH",
      title: "Message Header",
    });
    expect(segments?.byId.get("PID")).toEqual({
      id: "PID",
      title: "Patient Identification",
    });
  });

  it("holds no Z-segments", async () => {
    const segments = await loadSegments("2.5");

    expect(segments?.byId.has("ZZZ")).toBe(false);
  });

  it("loads the segments of the version asked for", async () => {
    const v21 = await loadSegments("2.1");
    const v282 = await loadSegments("2.8.2");

    expect(v21?.byId.size).toBeLessThan(v282?.byId.size);
  });

  it("loads every bundled version", async () => {
    for (const version of VERSIONS) {
      const segments = await loadSegments(version);
      expect(segments?.byId.has("MSH")).toBe(true);
    }
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await loadSegments("2.5");
    const second = await loadSegments("2.5");

    expect(first).toBe(second);
  });

  it("resolves undefined for a version that is not bundled", async () => {
    await expect(loadSegments("99.99")).resolves.toBeUndefined();
  });
});
