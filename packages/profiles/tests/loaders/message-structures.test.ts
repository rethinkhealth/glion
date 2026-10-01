import { loadMessageStructures } from "../../src/loaders/message-structures";
import { runner } from "../../src/structure/runner";
import type { MessageStructure } from "../../src/structure/types";

const load = async (version: string, id: string) => {
  const structures = await loadMessageStructures(version);
  const structure = structures?.get(id);
  if (!structure) {
    throw new Error(`v${version} bundles no ${id}`);
  }
  return structure;
};

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
    const ehc = await load("2.6", "EHC_E01");

    expect(accepts(ehc, ["MSH", "IVC"])).toBe(true);
    expect(accepts(ehc, ["MSH", "PYE"])).toBe(true);
    expect(accepts(ehc, ["MSH"])).toBe(true);
    expect(accepts(ehc, ["MSH", "IVC", "PYE"])).toBe(false);
  });

  it("reads a choice as exactly one of its alternatives", async () => {
    const orm = await load("2.5", "ORM_O01");

    expect(accepts(orm, ["MSH", "PID", "ORC", "RXO"])).toBe(true);
    expect(accepts(orm, ["MSH", "PID", "ORC", "OBR", "RXO"])).toBe(false);
  });
});

describe("loadMessageStructures", () => {
  it("loads a message structure by structure ID", async () => {
    const structure = await load("2.5", "ADT_A01");

    expect(structure.id).toBe("ADT_A01");
    expect(structure.elements[0]).toEqual({
      name: "MSH",
      optional: false,
      repeating: false,
      type: "segment",
    });
  });

  it("keys structures by structure ID, not by trigger event", async () => {
    const structures = await loadMessageStructures("2.5");

    expect(structures?.get("ADT_A04")).toBeUndefined();
  });

  it("keys each version by its own structures", async () => {
    const v21 = await load("2.1", "ADT_A01");
    const v282 = await load("2.8.2", "ADT_A01");

    expect(v21).not.toBe(v282);
    expect(v21.id).toBe("ADT_A01");
    expect(v282.id).toBe("ADT_A01");
  });

  it("resolves undefined for a version not bundled", async () => {
    await expect(loadMessageStructures("99.99")).resolves.toBeUndefined();
  });

  it("returns the same map on every call", async () => {
    const first = await loadMessageStructures("2.5");
    const second = await loadMessageStructures("2.5");

    expect(first).toBe(second);
  });
});
