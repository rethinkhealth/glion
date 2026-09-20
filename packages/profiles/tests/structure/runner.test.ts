import { runner } from "../../src/structure/runner";
import type {
  MessageStructure,
  StructureElement,
} from "../../src/structure/types";

const structureOf = (...elements: StructureElement[]): MessageStructure => ({
  elements,
  id: "TEST",
});

const consumeAll = (automaton: ReturnType<typeof runner>, ...names: string[]) =>
  names.map((name) => automaton.consume(name));

describe("runner", () => {
  it("steps through segments in the order the structure defines", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "PID", optional: false, repeating: false, type: "segment" }
      )
    );

    expect(consumeAll(automaton, "MSH", "PID")).toEqual([
      { type: "step" },
      { type: "step" },
    ]);
    expect(automaton.accepted).toBe(true);
  });

  it("rejects a segment the structure does not allow there and lists the expected ones", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "EVN", optional: false, repeating: false, type: "segment" },
        { name: "SFT", optional: true, repeating: false, type: "segment" }
      )
    );
    automaton.consume("MSH");

    expect(automaton.consume("PID")).toEqual({
      expected: ["EVN"],
      symbol: "PID",
      type: "invalid",
    });
    expect(automaton.accepted).toBe(false);
  });

  it("rejects every segment after the first rejection, with nothing expected", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "PID", optional: false, repeating: false, type: "segment" }
      )
    );

    automaton.consume("PV1");

    expect(automaton.consume("MSH")).toEqual({
      expected: [],
      symbol: "MSH",
      type: "invalid",
    });
    expect(automaton.accepted).toBe(false);
  });

  it("keeps the expected segments of the last accepted position after a rejection", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "PID", optional: false, repeating: false, type: "segment" }
      )
    );

    consumeAll(automaton, "MSH", "PV1");

    expect(automaton.expected).toEqual(["PID"]);
  });

  it("is not accepted before the structure's required segments have all arrived", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "PID", optional: false, repeating: false, type: "segment" }
      )
    );

    automaton.consume("MSH");

    expect(automaton.accepted).toBe(false);
    expect(automaton.expected).toEqual(["PID"]);
  });

  it("does not accept an empty message when the structure requires a segment", () => {
    const automaton = runner(
      structureOf({
        name: "MSH",
        optional: false,
        repeating: false,
        type: "segment",
      })
    );

    expect(automaton.accepted).toBe(false);
    expect(automaton.expected).toEqual(["MSH"]);
  });

  it("accepts a repeating segment any number of times", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "OBX", optional: false, repeating: true, type: "segment" }
      )
    );

    consumeAll(automaton, "MSH", "OBX", "OBX", "OBX");

    expect(automaton.accepted).toBe(true);
    expect(automaton.expected).toEqual(["OBX"]);
  });

  it("accepts a message with or without an optional segment", () => {
    const structure = structureOf(
      { name: "MSH", optional: false, repeating: false, type: "segment" },
      { name: "SFT", optional: true, repeating: false, type: "segment" },
      { name: "EVN", optional: false, repeating: false, type: "segment" }
    );

    const without = runner(structure);
    consumeAll(without, "MSH", "EVN");
    const withIt = runner(structure);
    consumeAll(withIt, "MSH", "SFT", "EVN");

    expect(without.accepted).toBe(true);
    expect(withIt.accepted).toBe(true);
  });

  it("lists every segment that can come next, across optional elements and groups, sorted", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "SFT", optional: true, repeating: true, type: "segment" },
        {
          elements: [
            { name: "PV1", optional: false, repeating: false, type: "segment" },
            { name: "PV2", optional: true, repeating: false, type: "segment" },
          ],
          name: "VISIT",
          optional: true,
          repeating: false,
          type: "group",
        },
        { name: "DG1", optional: false, repeating: false, type: "segment" }
      )
    );

    automaton.consume("MSH");

    expect(automaton.expected).toEqual(["DG1", "PV1", "SFT"]);
  });

  it("accepts exactly one alternative of a choice", () => {
    const structure = structureOf(
      { name: "ORC", optional: false, repeating: false, type: "segment" },
      {
        alternatives: [
          { name: "OBR", optional: false, repeating: false, type: "segment" },
          { name: "RXO", optional: false, repeating: false, type: "segment" },
        ],
        optional: false,
        repeating: false,
        type: "choice",
      }
    );

    const lab = runner(structure);
    consumeAll(lab, "ORC", "OBR");
    const both = runner(structure);

    expect(lab.accepted).toBe(true);
    expect(consumeAll(both, "ORC", "OBR", "RXO").at(-1)).toEqual({
      expected: [],
      symbol: "RXO",
      type: "invalid",
    });
  });

  it("accepts any segment in an Hxx position, including one the structure names elsewhere", () => {
    const structure = structureOf(
      { name: "MSH", optional: false, repeating: false, type: "segment" },
      { name: "Hxx", optional: true, repeating: false, type: "segment" },
      { name: "RCP", optional: false, repeating: false, type: "segment" }
    );

    const named = runner(structure);
    consumeAll(named, "MSH", "RCP", "RCP");
    const unnamed = runner(structure);
    consumeAll(unnamed, "MSH", "ZQP", "RCP");

    expect(named.accepted).toBe(true);
    expect(unnamed.accepted).toBe(true);
  });

  it("lists Hxx among the expected segments", () => {
    const automaton = runner(
      structureOf(
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "Hxx", optional: true, repeating: false, type: "segment" },
        { name: "RCP", optional: false, repeating: false, type: "segment" }
      )
    );

    automaton.consume("MSH");

    expect(automaton.expected).toEqual(["Hxx", "RCP"]);
  });

  it("gives each runner its own position", () => {
    const structure = structureOf(
      { name: "MSH", optional: false, repeating: false, type: "segment" },
      { name: "PID", optional: false, repeating: false, type: "segment" }
    );
    const first = runner(structure);
    const second = runner(structure);

    first.consume("MSH");

    expect(first.expected).toEqual(["PID"]);
    expect(second.expected).toEqual(["MSH"]);
  });
});
