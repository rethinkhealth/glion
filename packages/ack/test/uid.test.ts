import { uid } from "../src/uid";

describe("uid", () => {
  it("generates a 20-character string by default", () => {
    const id = uid();
    expect(id).toHaveLength(20);
  });

  it("generates a custom-length string", () => {
    const id = uid({ size: 10 });
    expect(id).toHaveLength(10);
  });

  it("generates unique IDs on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uid()));
    // The chance of collision is astronomically low for 20 random characters (62^20 possibilities)
    expect(ids.size).toBe(100);
  });

  it("prepends a prefix and fills remaining with random characters", () => {
    const id = uid({ prefix: "ACK_" });
    expect(id).toHaveLength(20);
    expect(id).toMatch(/^ACK_.{16}$/);
  });

  it("respects size with prefix", () => {
    const id = uid({ prefix: "MSG", size: 10 });
    expect(id).toHaveLength(10);
    expect(id).toMatch(/^MSG.{7}$/);
  });

  it("truncates prefix when it exceeds size", () => {
    const id = uid({ prefix: "LONGPREFIX", size: 5 });
    expect(id).toBe("LONGP");
  });

  it("returns only the prefix when prefix length equals size", () => {
    const id = uid({ prefix: "EXACT", size: 5 });
    expect(id).toBe("EXACT");
  });
});
