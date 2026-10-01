import { loadFields } from "../../src/loaders/fields";

describe("loadFields", () => {
  it("loads the field definitions of PID in v2.5", async () => {
    const fields = await loadFields("2.5");
    const pid = fields?.get("PID");

    expect(pid?.segmentId).toBe("PID");
    expect(pid?.bySequence.get(3)?.id).toBe("PID-3");
    expect(pid?.requiredSequences.has(3)).toBe(true);
  });

  it("reads maxLength and datatype for MSH-1", async () => {
    const fields = await loadFields("2.5");
    const msh1 = fields?.get("MSH")?.bySequence.get(1);

    expect(msh1?.id).toBe("MSH-1");
    expect(msh1?.datatype).toBe("ST");
    expect(typeof msh1?.maxLength).toBe("number");
  });

  it("keys each version by its own segments", async () => {
    const v21 = await loadFields("2.1");
    const v282 = await loadFields("2.8.2");

    expect(v21?.has("PID")).toBe(true);
    expect(v282?.has("PID")).toBe(true);
    expect(v21?.has("PRT")).toBe(false);
    expect(v282?.has("PRT")).toBe(true);
  });

  it("has no entry for a Z-segment", async () => {
    const fields = await loadFields("2.5");

    expect(fields?.get("ZZZ")).toBeUndefined();
  });

  it("resolves undefined for a version not bundled", async () => {
    await expect(loadFields("99.99")).resolves.toBeUndefined();
  });

  it("returns the same map on every call", async () => {
    const first = await loadFields("2.5");
    const second = await loadFields("2.5");

    expect(first).toBe(second);
  });
});
