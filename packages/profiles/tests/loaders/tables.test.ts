import { loadTables } from "../../src/loaders/tables";

describe("loadTables", () => {
  it("loads table 0001 in v2.5", async () => {
    const tables = await loadTables("2.5");
    const table = tables?.get("0001");

    expect(table?.id).toBe("0001");
    expect(table?.description).toBe("Administrative Sex");
    expect(table?.type).toBe("user");
    expect(table?.codes.has("F")).toBe(true);
    expect(table?.codes.has("M")).toBe(true);
  });

  it("loads an HL7-defined table", async () => {
    const tables = await loadTables("2.5");
    const table = tables?.get("0003");

    expect(table?.type).toBe("hl7");
    expect(table?.codes.size).toBeGreaterThan(100);
  });

  it("keys each version by its own tables", async () => {
    const v21 = await loadTables("2.1");
    const v25 = await loadTables("2.5");

    expect(v21?.get("0001")?.codes.size).toBeLessThan(
      v25?.get("0001")?.codes.size ?? 0
    );
  });

  it("has no entry for an unknown table", async () => {
    const tables = await loadTables("2.5");

    expect(tables?.get("ZZZZ")).toBeUndefined();
  });

  it("resolves undefined for a version not bundled", async () => {
    await expect(loadTables("99.99")).resolves.toBeUndefined();
  });

  it("returns the same map on every call", async () => {
    const first = await loadTables("2.5");
    const second = await loadTables("2.5");

    expect(first).toBe(second);
  });
});
