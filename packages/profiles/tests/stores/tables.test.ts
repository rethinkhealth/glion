import { tables } from "../../src/stores/tables";

describe("tables", () => {
  it("loads a table, its codes keyed by value", async () => {
    const sex = await tables.load("2.5", "0001");

    expect(sex).toMatchObject({
      description: "Administrative Sex",
      id: "0001",
      type: "user",
    });
    expect(sex?.codes.get("M")).toEqual({ description: "Male", name: "M" });
  });

  it("loads an HL7-defined table", async () => {
    const eventType = await tables.load("2.5", "0003");

    expect(eventType?.type).toBe("hl7");
  });

  it("loads the table of the version asked for", async () => {
    const v21 = await tables.load("2.1", "0001");
    const v25 = await tables.load("2.5", "0001");

    expect(v21?.codes.size).toBeLessThan(v25?.codes.size ?? 0);
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await tables.load("2.5", "0001");
    const second = await tables.load("2.5", "0001");

    expect(first).toBe(second);
  });

  it("resolves undefined for a table the version does not bundle", async () => {
    await expect(tables.load("2.5", "ZZZZ")).resolves.toBeUndefined();
  });

  it("resolves undefined for a version that is not bundled", async () => {
    await expect(tables.load("9.9", "0001")).resolves.toBeUndefined();
  });
});
