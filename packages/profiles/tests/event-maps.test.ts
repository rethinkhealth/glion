import { eventMaps } from "../src/event-maps";

describe("eventMaps", () => {
  it("keys the event maps by HL7v2 version", () => {
    expect(Object.keys(eventMaps).toSorted()).toEqual([
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

  it("maps a trigger event to its event schema", () => {
    expect(eventMaps["2.5"]?.ADT_A04).toBe("ADT_A01");
  });
});
