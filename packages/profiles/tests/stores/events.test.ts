import { profiles } from "../../src/profiles";
import { matchStructure } from "../../src/structure/match";
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
  it("reads the invoice groups the XML schemas encode as choices as sequences", async () => {
    const ehc = await profiles.events.load("2.6", "EHC_E01");

    expect(accepts(ehc, ["MSH", "IVC", "PYE", "PSS", "PSG", "PSL"])).toBe(true);
    expect(accepts(ehc, ["MSH", "IVC"])).toBe(false);
    expect(matchStructure(ehc, ["MSH", "IVC", "PSS", "PSG", "PSL"])).toEqual([
      0,
      1,
      {
        children: [
          2,
          {
            children: [3, { children: [4], name: "PRODUCT_SERVICE_LINE_ITEM" }],
            name: "PRODUCT_SERVICE_GROUP",
          },
        ],
        name: "PRODUCT_SERVICE_SECTION",
      },
    ]);
  });

  it("reads a choice as exactly one of its alternatives", async () => {
    const orm = await profiles.events.load("2.5", "ORM_O01");

    expect(accepts(orm, ["MSH", "PID", "ORC", "RXO"])).toBe(true);
    expect(accepts(orm, ["MSH", "PID", "ORC", "OBR", "RXO"])).toBe(false);
  });
});
