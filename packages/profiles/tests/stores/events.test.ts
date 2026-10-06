import { runner } from "../../src/automata/runner";
import { events } from "../../src/stores/events";

describe("events", () => {
  it("loads the definition of a message structure", async () => {
    const adtA01 = await events.load("2.5", "ADT_A01");
    if (!adtA01) {
      throw new Error("ADT_A01 is not bundled in 2.5");
    }
    const r = runner(adtA01);

    for (const segment of ["MSH", "EVN", "PID", "PV1"]) {
      r.consume(segment);
    }

    expect(r.accepted).toBe(true);
  });

  it("resolves a trigger event to the structure the event map gives it", async () => {
    const adtA04 = await events.load("2.5", "ADT_A04");
    const adtA01 = await events.load("2.5", "ADT_A01");

    expect(adtA04).toBe(adtA01);
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await events.load("2.5", "ACK");
    const second = await events.load("2.5", "ACK");

    expect(first).toBe(second);
  });

  it("resolves undefined for an event the version does not bundle", async () => {
    await expect(events.load("2.5", "ZZZ_Z99")).resolves.toBeUndefined();
  });
});
