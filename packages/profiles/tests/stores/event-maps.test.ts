import { eventMaps } from "../../src/stores/event-maps";

describe("eventMaps", () => {
  it("maps an event to the message structure it uses", async () => {
    const eventMap = await eventMaps.load("2.5");

    expect(eventMap.ADT_A01).toBe("ADT_A01");
    expect(eventMap.ADT_A04).toBe("ADT_A01");
  });

  it("loads the event map of the version asked for", async () => {
    const v21 = await eventMaps.load("2.1");
    const v23 = await eventMaps.load("2.3");

    expect(v21.ADT_A01).toBe("ADT_A01");
    expect(v23.ADT_A04).toBe("ADT_A01");
  });

  it("has no entry for an event the version does not map", async () => {
    const eventMap = await eventMaps.load("2.5");

    expect(eventMap.ZZZ_Z99).toBeUndefined();
  });

  it("has no entry for a key naming an Object.prototype key", async () => {
    const eventMap = await eventMaps.load("2.5");

    for (const key of [
      "__proto__",
      "constructor",
      "hasOwnProperty",
      "toString",
    ]) {
      expect(eventMap[key]).toBeUndefined();
    }
  });

  it("resolves the same value for repeated loads", async () => {
    expect(await eventMaps.load("2.5")).toBe(await eventMaps.load("2.5"));
  });

  it("rejects a version that is not bundled", async () => {
    await expect(eventMaps.load("9.9")).rejects.toThrow(
      "Unknown event map: v9.9"
    );
    await expect(eventMaps.load("__proto__")).rejects.toThrow(
      "Unknown event map: v__proto__"
    );
  });
});
