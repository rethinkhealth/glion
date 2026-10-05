import { eventMapEntry } from "../src/event-map-entry";

describe("eventMapEntry", () => {
  it("resolves a direct mapping (v2.5 ADT_A01)", () => {
    expect(eventMapEntry("2.5", "ADT_A01")).toBe("ADT_A01");
  });

  it("resolves an alias mapping (v2.5 ADT_A04 → ADT_A01)", () => {
    expect(eventMapEntry("2.5", "ADT_A04")).toBe("ADT_A01");
  });

  it("resolves v2.1 1:1 mapping (no aliases)", () => {
    expect(eventMapEntry("2.1", "ADT_A01")).toBe("ADT_A01");
  });

  it("resolves v2.3 alias mapping (ADT_A04 → ADT_A01)", () => {
    expect(eventMapEntry("2.3", "ADT_A04")).toBe("ADT_A01");
  });

  it("returns undefined for unknown version", () => {
    expect(eventMapEntry("9.9", "ADT_A01")).toBeUndefined();
  });

  it("returns undefined for unknown event", () => {
    expect(eventMapEntry("2.5", "ZZZ_Z99")).toBeUndefined();
  });

  it("returns undefined for a key with no message code", () => {
    expect(eventMapEntry("2.5", "_A01")).toBeUndefined();
  });

  it("returns undefined for a key with no trigger event", () => {
    expect(eventMapEntry("2.5", "ADT_")).toBeUndefined();
  });

  it("returns undefined for a key or version naming an Object.prototype key", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "hasOwnProperty",
      "toString",
    ]) {
      expect(eventMapEntry("2.5", key)).toBeUndefined();
      expect(eventMapEntry(key, "ADT_A01")).toBeUndefined();
    }
  });
});
