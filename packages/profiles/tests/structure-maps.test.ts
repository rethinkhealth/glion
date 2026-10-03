import { structureMaps } from "../src/structure-maps";

describe("structureMaps", () => {
  it("keys the structure maps by HL7v2 version", () => {
    expect(Object.keys(structureMaps).toSorted()).toEqual([
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
    ]);
  });

  it("maps a trigger event to its message structure", () => {
    expect(structureMaps["2.5"]?.ADT_A04).toBe("ADT_A01");
  });
});
