import { repair } from "../../src/engine/repair";
import { runner } from "../../src/engine/runner";
import type { EventSchema, EventSchemaElement } from "../../src/engine/types";
import { ADT_A01_V2_5, ORU_R01_V2_5 } from "./fixtures";

const schemaOf = (...elements: EventSchemaElement[]): EventSchema => ({
  elements,
  id: "TEST",
});

const segment = (
  name: string,
  { optional = false, repeating = false } = {}
): EventSchemaElement => ({ name, optional, repeating, type: "segment" });

const repairOf = (schema: EventSchema, message: string) =>
  repair(schema, message.split(" "));

describe("repair: a message that fits", () => {
  it("has no edits for a message the runner matches", () => {
    const input = "MSH PID OBR OBX OBX NTE OBR OBX".split(" ");

    expect(runner(ORU_R01_V2_5, input).type).toBe("matched");
    expect(repair(ORU_R01_V2_5, input)).toEqual([]);
  });

  it("has no edits for a Z-segment the schema does not name", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH EVN PID PV1 ZPI AL1")).toEqual([]);
  });
});

describe("repair: missing segments", () => {
  it("reports a segment the schema requires as missing, before the segment it precedes, in the groups it belongs in", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBX OBX")).toEqual([
      {
        index: 2,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports every missing segment, not only the first", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH PID AL1")).toEqual([
      { index: 1, path: [], segment: "EVN", type: "missing" },
      { index: 2, path: [], segment: "PV1", type: "missing" },
    ]);
  });

  it("reports a segment missing at the end with the input length as its index", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID")).toEqual([
      {
        index: 2,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports every segment of an empty message's required elements as missing", () => {
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
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBR OBX PV1 OBX")).toEqual([
      {
        index: 4,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION", "OBSERVATION"],
        segment: "PV1",
        type: "unexpected",
      },
    ]);
  });

  it("reports a segment after the end of the message as unexpected", () => {
    const schema = schemaOf(segment("MSH"), segment("PID"));
    expect(repair(schema, ["MSH", "PID", "PID"])).toEqual([
      { index: 2, path: [], segment: "PID", type: "unexpected" },
    ]);
  });

  it("reports a Z-segment the schema does not name as unexpected when Z-segments are not allowed", () => {
    expect(
      repair(ADT_A01_V2_5, "MSH EVN PID PV1 ZPI AL1".split(" "), {
        allowZSegments: false,
      })
    ).toEqual([{ index: 4, path: [], segment: "ZPI", type: "unexpected" }]);
  });
});

describe("repair: the repair it chooses", () => {
  it("prefers a missing segment to an unexpected one when both cost one edit", () => {
    // Removing the ORC also makes the message fit.
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBR OBX ORC OBX")).toEqual([
      {
        index: 5,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports a segment out of place next to the schema segment it displaces", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH PIDX PV")).toEqual([
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
