import { runner } from "../../src/engine/runner";
import type { EventSchema } from "../../src/engine/types";
import { events } from "../../src/stores/events";

const accepts = (
  schema: EventSchema | undefined,
  input: readonly string[]
): boolean => schema !== undefined && runner(schema, input).type === "matched";

describe("events", () => {
  it("loads the event schema of a message structure", async () => {
    const adtA01 = await events.load("2.5", "ADT_A01");

    expect(adtA01?.id).toBe("ADT_A01");
    expect(accepts(adtA01, ["MSH", "EVN", "PID", "PV1"])).toBe(true);
  });

  it("resolves a trigger event to the schema the event map gives it", async () => {
    const adtA04 = await events.load("2.5", "ADT_A04");
    const adtA01 = await events.load("2.5", "ADT_A01");

    expect(adtA04).toBe(adtA01);
  });

  it("resolves the same value for repeated loads", async () => {
    const first = await events.load("2.5", "ACK");
    const second = await events.load("2.5", "ACK");

    expect(first).toBe(second);
  });

  it("resolves a schema frozen at every depth, so a run can reuse its program", async () => {
    const schema = await events.load("2.5", "ORU_R01");
    const group = schema?.elements.find(({ type }) => type === "group");

    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema?.elements)).toBe(true);
    expect(group).toBeDefined();
    expect(Object.isFrozen(group)).toBe(true);
    expect(group?.type === "group" && Object.isFrozen(group.elements[0])).toBe(
      true
    );
  });

  it("resolves undefined for an event the version does not bundle", async () => {
    await expect(events.load("2.5", "ZZZ_Z99")).resolves.toBeUndefined();
  });

  it("reads a choice with optional members as the XML schemas encode it (#838)", async () => {
    // EHC_E01 v2.6 INVOICE_INFORMATION is an xsd:choice whose members PYE,
    // CTD, AUT, LOC, and ROL are optional: one member per message, or none.
    const ehc = await events.load("2.6", "EHC_E01");

    expect(accepts(ehc, ["MSH", "IVC"])).toBe(true);
    expect(accepts(ehc, ["MSH", "PYE"])).toBe(true);
    expect(accepts(ehc, ["MSH"])).toBe(true);
    expect(accepts(ehc, ["MSH", "IVC", "PYE"])).toBe(false);
  });

  it("reads a choice as exactly one of its alternatives", async () => {
    const orm = await events.load("2.5", "ORM_O01");

    expect(accepts(orm, ["MSH", "PID", "ORC", "RXO"])).toBe(true);
    expect(accepts(orm, ["MSH", "PID", "ORC", "OBR", "RXO"])).toBe(false);
  });
});
