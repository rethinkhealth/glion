import { fields } from "../../src/stores/fields";

describe("fields", () => {
  it("loads the fields of a segment, keyed by sequence", async () => {
    const msh = await fields.load("2.5", "MSH");

    expect(msh?.segmentId).toBe("MSH");
    expect(msh?.bySequence.get(1)).toEqual({
      datatype: "ST",
      id: "MSH-1",
      item: "1",
      maxLength: 1,
      name: "Field Separator",
      repeatable: false,
      required: true,
      sequence: 1,
    });
  });

  it("lists the sequences of the required fields", async () => {
    const msh = await fields.load("2.5", "MSH");

    expect([...(msh?.requiredSequences ?? [])]).toEqual([
      1, 2, 7, 9, 10, 11, 12,
    ]);
  });

  it("loads the fields of the version asked for", async () => {
    const v21 = await fields.load("2.1", "PID");
    const v282 = await fields.load("2.8.2", "PID");

    expect(v21?.bySequence.size).toBeLessThan(v282?.bySequence.size);
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await fields.load("2.5", "PID");
    const second = await fields.load("2.5", "PID");

    expect(first).toBe(second);
  });

  it("resolves undefined for a segment the version does not bundle", async () => {
    await expect(fields.load("2.5", "ZZZ")).resolves.toBeUndefined();
  });

  it("resolves undefined for a version that is not bundled", async () => {
    await expect(fields.load("9.9", "PID")).resolves.toBeUndefined();
  });
});
