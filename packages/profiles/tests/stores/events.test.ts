import { profiles } from "../../src/profiles";
import { runner } from "../../src/structure/runner";
import type { MessageStructure } from "../../src/structure/types";

const accepts = (structure: MessageStructure, input: readonly string[]) => {
  const automaton = runner(structure);
  return (
    input.every((name) => automaton.consume(name).type === "step") &&
    automaton.accepted
  );
};

describe("bundled message structures", () => {
  it("reads a choice with optional members as the XML schemas encode it (#838)", async () => {
    // EHC_E01 v2.6 INVOICE_INFORMATION is an xsd:choice whose members PYE,
    // CTD, AUT, LOC, and ROL are optional: one member per message, or none.
    const ehc = await profiles.events.load("2.6", "EHC_E01");

    expect(accepts(ehc, ["MSH", "IVC"])).toBe(true);
    expect(accepts(ehc, ["MSH", "PYE"])).toBe(true);
    expect(accepts(ehc, ["MSH"])).toBe(true);
    expect(accepts(ehc, ["MSH", "IVC", "PYE"])).toBe(false);
  });

  it("reads a choice as exactly one of its alternatives", async () => {
    const orm = await profiles.events.load("2.5", "ORM_O01");

    expect(accepts(orm, ["MSH", "PID", "ORC", "RXO"])).toBe(true);
    expect(accepts(orm, ["MSH", "PID", "ORC", "OBR", "RXO"])).toBe(false);
  });
});
