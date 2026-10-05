import { compileEventSchema } from "../../src/event-schema/compile";
import { runner } from "../../src/event-schema/runner";
import type { EventSchema } from "../../src/event-schema/types";
import { ORU_R01_V2_5 } from "./fixtures";

describe("compileEventSchema", () => {
  it("rejects a schema with no elements", () => {
    expect(() => compileEventSchema({ elements: [], id: "ZZZ_Z10" })).toThrow(
      "Invalid event schema ZZZ_Z10: it has no elements"
    );
  });

  it("rejects a segment with no name", () => {
    expect(() =>
      compileEventSchema({
        elements: [
          { name: "", optional: false, repeating: false, type: "segment" },
        ],
        id: "ZZZ_Z11",
      })
    ).toThrow("Invalid event schema ZZZ_Z11: a segment has no name");
  });

  it("rejects a group with no name", () => {
    expect(() =>
      compileEventSchema({
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
            name: "",
            optional: false,
            repeating: false,
            type: "group",
          },
        ],
        id: "ZZZ_Z12",
      })
    ).toThrow("Invalid event schema ZZZ_Z12: a group has no name");
  });

  it("rejects a group with no elements", () => {
    expect(() =>
      compileEventSchema({
        elements: [
          {
            elements: [],
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
      compileEventSchema({
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
      compileEventSchema({
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
      compileEventSchema({
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
      groups: [{ children: [0, 1], name: "ORDER" }],
      type: "matched",
    });
  });

  it("numbers groups in the order the schema lists them", () => {
    expect(compileEventSchema(ORU_R01_V2_5).groups).toEqual([
      "PATIENT_RESULT",
      "PATIENT",
      "VISIT",
      "ORDER_OBSERVATION",
      "TIMING_QTY",
      "OBSERVATION",
      "SPECIMEN",
    ]);
  });

  it("moves every segment state to the next state number", () => {
    const program = compileEventSchema(ORU_R01_V2_5);

    for (const [state, segment] of program.segments.entries()) {
      if (segment !== null) {
        expect(program.edges[state]).toEqual([]);
        expect(program.segments[state + 1]).toBeNull();
      }
    }
  });
});
