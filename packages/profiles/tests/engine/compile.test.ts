import { compile } from "../../src/engine/compile";
import { runner } from "../../src/engine/runner";
import type { EventSchema } from "../../src/engine/types";
import { ORU_R01_V2_5 } from "./fixtures";

describe("compile", () => {
  it("compiles equal schemas to equal programs", () => {
    expect(compile({ ...ORU_R01_V2_5 })).toEqual(compile(ORU_R01_V2_5));
  });

  it("rejects a schema with no elements", () => {
    expect(() => compile({ elements: [], id: "ZZZ_Z10" })).toThrow(
      "Invalid event schema ZZZ_Z10: it has no elements"
    );
  });

  it("rejects a segment with no name", () => {
    expect(() =>
      compile({
        elements: [
          { name: "", optional: false, repeating: false, type: "segment" },
        ],
        id: "ZZZ_Z11",
      })
    ).toThrow("Invalid event schema ZZZ_Z11: a segment has no name");
  });

  it("rejects a group with no ID", () => {
    expect(() =>
      compile({
        elements: [
          {
            elements: [
              {
                name: "PID",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            id: "",
            name: "Patient Visit",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZZZ_Z12",
      })
    ).toThrow("Invalid event schema ZZZ_Z12: a group has no ID");
  });

  it("rejects a group with no name", () => {
    expect(() =>
      compile({
        elements: [
          {
            elements: [
              {
                name: "PID",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            id: "PATIENT_VISIT",
            name: "",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZZZ_Z14",
      })
    ).toThrow("Invalid event schema ZZZ_Z14: group PATIENT_VISIT has no name");
  });

  it("rejects a group with no elements", () => {
    expect(() =>
      compile({
        elements: [
          {
            elements: [],
            id: "VISIT",
            name: "VISIT",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZZZ_Z13",
      })
    ).toThrow("Invalid event schema ZZZ_Z13: group VISIT has no elements");
  });

  it("rejects a choice with no alternatives", () => {
    expect(() =>
      compile({
        elements: [
          {
            alternatives: [],
            optional: false,
            repeating: false,
            type: "choice",
          },
        ],
        id: "ZZZ_Z14",
      })
    ).toThrow("Invalid event schema ZZZ_Z14: a choice has no alternatives");
  });

  it("rejects a choice whose alternative can match no segment", () => {
    expect(() =>
      compile({
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          {
            alternatives: [
              {
                name: "OBR",
                optional: true,
                repeating: false,
                type: "segment",
              },
              {
                name: "RXO",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            optional: false,
            repeating: false,
            type: "choice",
          },
        ],
        id: "ZZZ_Z01",
      })
    ).toThrow(
      "Invalid event schema ZZZ_Z01: a choice alternative can match no segment"
    );
  });

  it("rejects a choice whose alternative is a group of optional segments", () => {
    expect(() =>
      compile({
        elements: [
          { name: "MSH", optional: false, repeating: false, type: "segment" },
          {
            alternatives: [
              {
                elements: [
                  {
                    name: "NTE",
                    optional: true,
                    repeating: true,
                    type: "segment",
                  },
                ],
                id: "NOTES",
                name: "NOTES",
                optional: false,
                repeating: false,
                type: "group",
              },
              {
                name: "RXO",
                optional: false,
                repeating: false,
                type: "segment",
              },
            ],
            optional: false,
            repeating: false,
            type: "choice",
          },
        ],
        id: "ZZZ_Z02",
      })
    ).toThrow(
      "Invalid event schema ZZZ_Z02: a choice alternative can match no segment"
    );
  });

  it("accepts a choice whose alternative is a group with a required segment", () => {
    const schema: EventSchema = {
      elements: [
        {
          alternatives: [
            {
              elements: [
                {
                  name: "OBR",
                  optional: false,
                  repeating: false,
                  type: "segment",
                },
                {
                  name: "NTE",
                  optional: true,
                  repeating: true,
                  type: "segment",
                },
              ],
              id: "ORDER",
              name: "ORDER",
              optional: false,
              repeating: false,
              type: "group",
            },
            { name: "RXO", optional: false, repeating: false, type: "segment" },
          ],
          optional: false,
          repeating: false,
          type: "choice",
        },
      ],
      id: "ZZZ_Z03",
    };

    expect(runner(schema, ["OBR", "NTE"])).toEqual({
      groups: [{ children: [0, 1], id: "ORDER", name: "ORDER" }],
      type: "matched",
    });
  });

  it("opens and closes each group of the schema once", () => {
    const { code } = compile(ORU_R01_V2_5);
    const opened = code.flatMap((instruction) =>
      instruction.op === "open" ? [instruction.id] : []
    );

    expect(opened.toSorted()).toEqual([
      "OBSERVATION",
      "ORDER_OBSERVATION",
      "PATIENT",
      "PATIENT_RESULT",
      "SPECIMEN",
      "TIMING_QTY",
      "VISIT",
    ]);
    expect(code.filter(({ op }) => op === "close")).toHaveLength(7);
  });

  it("points no instruction, and not the start, at a split with one target", () => {
    const { code, start } = compile(ORU_R01_V2_5);
    const jumps = (pc: number) => {
      const instruction = code[pc];
      return instruction?.op === "split" && instruction.targets.length === 1;
    };
    const successors: number[] = [];
    for (const instruction of code) {
      switch (instruction.op) {
        case "split": {
          successors.push(...instruction.targets);
          break;
        }
        case "segment":
        case "any":
        case "z":
        case "open":
        case "close": {
          successors.push(instruction.next);
          break;
        }
        case "match": {
          break;
        }
      }
    }

    expect(jumps(start)).toBe(false);
    for (const pc of successors) {
      expect(pc).toBeGreaterThanOrEqual(0);
      expect(pc).toBeLessThan(code.length);
      expect(jumps(pc)).toBe(false);
    }
  });

  it("ends every program in one match instruction", () => {
    expect(
      compile(ORU_R01_V2_5).code.filter(({ op }) => op === "match")
    ).toHaveLength(1);
  });

  it("compiles anyZSegment to an instruction that consumes any Z-segment", () => {
    const { code } = compile({
      elements: [
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        {
          name: "anyZSegment",
          optional: true,
          repeating: false,
          type: "segment",
        },
      ],
      id: "ZZZ_Z21",
    });

    expect(code.filter(({ op }) => op === "z")).toHaveLength(1);
    expect(
      code.some(
        (instruction) =>
          instruction.op === "segment" && instruction.id === "anyZSegment"
      )
    ).toBe(false);
  });

  it("compiles Hxx to an instruction that consumes any segment", () => {
    const { code } = compile({
      elements: [
        { name: "MSH", optional: false, repeating: false, type: "segment" },
        { name: "Hxx", optional: false, repeating: false, type: "segment" },
      ],
      id: "ZZZ_Z20",
    });

    expect(code.filter(({ op }) => op === "any")).toHaveLength(1);
    expect(
      code.some(
        (instruction) =>
          instruction.op === "segment" && instruction.id === "Hxx"
      )
    ).toBe(false);
  });
});
