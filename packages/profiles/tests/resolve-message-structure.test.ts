import { resolveMessageStructure } from "../src/resolve-message-structure";

describe("resolveMessageStructure", () => {
  it("resolves a direct mapping (v2.5 ADT_A01)", () => {
    expect(resolveMessageStructure("2.5", "ADT", "A01")).toBe("ADT_A01");
  });

  it("resolves an alias mapping (v2.5 ADT_A04 → ADT_A01)", () => {
    expect(resolveMessageStructure("2.5", "ADT", "A04")).toBe("ADT_A01");
  });

  it("resolves v2.1 1:1 mapping (no aliases)", () => {
    expect(resolveMessageStructure("2.1", "ADT", "A01")).toBe("ADT_A01");
  });

  it("resolves v2.3 alias mapping (ADT_A04 → ADT_A01)", () => {
    expect(resolveMessageStructure("2.3", "ADT", "A04")).toBe("ADT_A01");
  });

  it("returns undefined for unknown version", () => {
    expect(resolveMessageStructure("9.9", "ADT", "A01")).toBeUndefined();
  });

  it("returns undefined for unknown event", () => {
    expect(resolveMessageStructure("2.5", "ZZZ", "Z99")).toBeUndefined();
  });

  it("returns undefined for empty messageCode", () => {
    expect(resolveMessageStructure("2.5", "", "A01")).toBeUndefined();
  });

  it("returns undefined for empty triggerEvent", () => {
    expect(resolveMessageStructure("2.5", "ADT", "")).toBeUndefined();
  });
});
