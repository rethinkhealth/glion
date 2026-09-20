import { choice, group, segment } from "../../src/structure/build";
import { compileStructure } from "../../src/structure/compile";
import { runner } from "../../src/structure/runner";
import type { StructureElement } from "../../src/structure/types";

const program = (...elements: StructureElement[]) =>
  compileStructure({ elements, id: "TEST" });

const consumeAll = (automaton: ReturnType<typeof runner>, ...names: string[]) =>
  names.map((name) => automaton.consume(name));

describe("runner", () => {
  it("steps through segments in the order the structure defines", () => {
    const automaton = runner(program(segment("MSH"), segment("PID")));

    expect(consumeAll(automaton, "MSH", "PID")).toEqual([
      { type: "step" },
      { type: "step" },
    ]);
    expect(automaton.accepted).toBe(true);
  });

  it("rejects a segment the structure does not allow there and lists the expected ones", () => {
    const automaton = runner(
      program(
        segment("MSH"),
        segment("EVN"),
        segment("SFT", { optional: true })
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
    const automaton = runner(program(segment("MSH"), segment("PID")));

    automaton.consume("PV1");

    expect(automaton.consume("MSH")).toEqual({
      expected: [],
      symbol: "MSH",
      type: "invalid",
    });
    expect(automaton.accepted).toBe(false);
  });

  it("keeps the expected segments of the last accepted position after a rejection", () => {
    const automaton = runner(program(segment("MSH"), segment("PID")));

    consumeAll(automaton, "MSH", "PV1");

    expect(automaton.expected).toEqual(["PID"]);
  });

  it("is not accepted before the structure's required segments have all arrived", () => {
    const automaton = runner(program(segment("MSH"), segment("PID")));

    automaton.consume("MSH");

    expect(automaton.accepted).toBe(false);
    expect(automaton.expected).toEqual(["PID"]);
  });

  it("does not accept an empty message when the structure requires a segment", () => {
    const automaton = runner(program(segment("MSH")));

    expect(automaton.accepted).toBe(false);
    expect(automaton.expected).toEqual(["MSH"]);
  });

  it("accepts a repeating segment any number of times", () => {
    const automaton = runner(
      program(segment("MSH"), segment("OBX", { repeating: true }))
    );

    consumeAll(automaton, "MSH", "OBX", "OBX", "OBX");

    expect(automaton.accepted).toBe(true);
    expect(automaton.expected).toEqual(["OBX"]);
  });

  it("accepts a message with or without an optional segment", () => {
    const structure = program(
      segment("MSH"),
      segment("SFT", { optional: true }),
      segment("EVN")
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
      program(
        segment("MSH"),
        segment("SFT", { optional: true, repeating: true }),
        group("VISIT", [segment("PV1"), segment("PV2", { optional: true })], {
          optional: true,
        }),
        segment("DG1")
      )
    );

    automaton.consume("MSH");

    expect(automaton.expected).toEqual(["DG1", "PV1", "SFT"]);
  });

  it("accepts exactly one alternative of a choice", () => {
    const structure = program(
      segment("ORC"),
      choice([segment("OBR"), segment("RXO")])
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
    const structure = program(
      segment("MSH"),
      segment("Hxx", { optional: true }),
      segment("RCP")
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
      program(
        segment("MSH"),
        segment("Hxx", { optional: true }),
        segment("RCP")
      )
    );

    automaton.consume("MSH");

    expect(automaton.expected).toEqual(["Hxx", "RCP"]);
  });

  it("gives each runner its own position", () => {
    const structure = program(segment("MSH"), segment("PID"));
    const first = runner(structure);
    const second = runner(structure);

    first.consume("MSH");

    expect(first.expected).toEqual(["PID"]);
    expect(second.expected).toEqual(["MSH"]);
  });
});
