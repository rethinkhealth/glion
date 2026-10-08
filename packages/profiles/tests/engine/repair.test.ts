import { repair } from "../../src/engine/repair";
import { runner } from "../../src/engine/runner";
import type { EventSchema, EventSchemaElement } from "../../src/engine/types";

interface Occurrence {
  optional?: boolean;
  repeating?: boolean;
}

const segment = (
  name: string,
  { optional = false, repeating = false }: Occurrence = {}
): EventSchemaElement => ({ name, optional, repeating, type: "segment" });

const group = (
  id: string,
  elements: EventSchemaElement[],
  { optional = false, repeating = false }: Occurrence = {}
): EventSchemaElement => ({
  elements,
  id,
  name: id,
  optional,
  repeating,
  type: "group",
});

const schemaOf = (...elements: EventSchemaElement[]): EventSchema => ({
  elements,
  id: "TEST",
});

/**
 * MSH PATIENT { ORDER } [DSC], where
 *
 * - PATIENT is `PID [PD1]`,
 * - ORDER is `[ORC] OBR [{ RESULT }]`,
 * - RESULT is `OBX [{ NTE }]`.
 */
const LAB = schemaOf(
  segment("MSH"),
  group("PATIENT", [segment("PID"), segment("PD1", { optional: true })]),
  group(
    "ORDER",
    [
      segment("ORC", { optional: true }),
      segment("OBR"),
      group(
        "RESULT",
        [segment("OBX"), segment("NTE", { optional: true, repeating: true })],
        { optional: true, repeating: true }
      ),
    ],
    { repeating: true }
  ),
  segment("DSC", { optional: true })
);

/** MSH EVN PID PV1 [{ AL1 }], with no groups. */
const ADMIT = schemaOf(
  segment("MSH"),
  segment("EVN"),
  segment("PID"),
  segment("PV1"),
  segment("AL1", { optional: true, repeating: true })
);

const repairOf = (schema: EventSchema, message: string) =>
  repair(schema, message.split(" "));

describe("repair: a message that fits", () => {
  it("has no edits for a message the runner matches", () => {
    const input = "MSH PID OBR OBX OBX NTE ORC OBR OBX".split(" ");

    expect(runner(LAB, input).type).toBe("matched");
    expect(repair(LAB, input)).toEqual([]);
  });

  it("has no edits for a Z-segment the schema does not name", () => {
    expect(repairOf(ADMIT, "MSH EVN PID ZPI PV1")).toEqual([]);
  });
});

describe("repair: missing segments", () => {
  it("reports a segment the schema requires as missing, at the index it would be inserted at, in the groups it belongs in", () => {
    expect(repairOf(LAB, "MSH PID OBX OBX")).toEqual([
      { index: 2, path: ["ORDER"], segment: "OBR", type: "missing" },
    ]);
  });

  it("reports the first segment of a required group as missing in that group", () => {
    expect(repairOf(LAB, "MSH OBR OBX")).toEqual([
      { index: 1, path: ["PATIENT"], segment: "PID", type: "missing" },
    ]);
  });

  it("reports every missing segment, not only the first", () => {
    expect(repairOf(ADMIT, "MSH PID AL1")).toEqual([
      { index: 1, path: [], segment: "EVN", type: "missing" },
      { index: 2, path: [], segment: "PV1", type: "missing" },
    ]);
  });

  it("reports a segment missing at the end with the input length as its index", () => {
    expect(repairOf(LAB, "MSH PID")).toEqual([
      { index: 2, path: ["ORDER"], segment: "OBR", type: "missing" },
    ]);
  });

  it("reports every required segment of an empty message as missing", () => {
    expect(repair(schemaOf(segment("MSH"), segment("PID")), [])).toEqual([
      { index: 0, path: [], segment: "MSH", type: "missing" },
      { index: 0, path: [], segment: "PID", type: "missing" },
    ]);
  });

  it("names a missing Hxx as the schema names it", () => {
    const schema = schemaOf(segment("MSH"), segment("Hxx"));
    expect(repair(schema, ["MSH"])).toEqual([
      { index: 1, path: [], segment: "Hxx", type: "missing" },
    ]);
  });
});

describe("repair: unexpected segments", () => {
  it("reports a segment the schema does not allow there as unexpected, in the groups of the segment before it", () => {
    expect(repairOf(LAB, "MSH PID OBR OBX PV1 OBX")).toEqual([
      {
        index: 4,
        path: ["ORDER", "RESULT"],
        segment: "PV1",
        type: "unexpected",
      },
    ]);
  });

  it("reports a segment after the end of the message as unexpected", () => {
    expect(repairOf(LAB, "MSH PID OBR DSC PID")).toEqual([
      { index: 4, path: [], segment: "PID", type: "unexpected" },
    ]);
  });

  it("reports a Z-segment the schema does not name as unexpected when Z-segments are not allowed", () => {
    expect(
      repair(ADMIT, "MSH EVN PID ZPI PV1".split(" "), {
        allowZSegments: false,
      })
    ).toEqual([{ index: 3, path: [], segment: "ZPI", type: "unexpected" }]);
  });
});

describe("repair: the repair it chooses", () => {
  it("prefers a missing segment to an unexpected one when both cost one edit", () => {
    // Removing the ORC also makes the message fit.
    expect(repairOf(LAB, "MSH PID OBR OBX ORC OBX")).toEqual([
      { index: 5, path: ["ORDER"], segment: "OBR", type: "missing" },
    ]);
  });

  it("reports a required segment as missing, not as displaced, when the segment after it is valid there", () => {
    // AL1 may follow PV1, so PV1 is missing; AL1 is not in place of it.
    expect(repairOf(ADMIT, "MSH EVN PID AL1")).toEqual([
      { index: 3, path: [], segment: "PV1", type: "missing" },
    ]);
  });

  it("reports a segment out of place next to the schema segment it displaces", () => {
    expect(repairOf(ADMIT, "MSH PIDX PV")).toEqual([
      { index: 1, path: [], segment: "EVN", type: "missing" },
      { index: 1, path: [], segment: "PIDX", type: "unexpected" },
      { index: 2, path: [], segment: "PID", type: "missing" },
      { index: 2, path: [], segment: "PV", type: "unexpected" },
      { index: 3, path: [], segment: "PV1", type: "missing" },
    ]);
  });

  it("prefers fewer edits to fewer unexpected segments", () => {
    // Two missing segments, or one unexpected B.
    const schema = schemaOf(segment("MSH"), segment("A", { optional: true }));
    expect(repair(schema, ["MSH", "B"])).toEqual([
      { index: 1, path: [], segment: "B", type: "unexpected" },
    ]);
  });

  it("takes the earlier alternative of a choice for a missing segment", () => {
    const schema = schemaOf(segment("MSH"), {
      alternatives: [segment("A"), segment("B")],
      optional: false,
      repeating: false,
      type: "choice",
    });
    expect(repair(schema, ["MSH"])).toEqual([
      { index: 1, path: [], segment: "A", type: "missing" },
    ]);
  });
});

describe("repair: invalid schemas", () => {
  it("throws for a schema with no elements, as the runner does", () => {
    expect(() => repair({ elements: [], id: "EMPTY" }, ["MSH"])).toThrow(
      "Invalid event schema EMPTY: it has no elements"
    );
  });
});
