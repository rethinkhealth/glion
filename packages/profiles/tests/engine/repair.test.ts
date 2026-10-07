import { repair } from "../../src/engine/repair";
import { runner } from "../../src/engine/runner";
import type {
  EventSchema,
  EventSchemaElement,
  SegmentMatch,
} from "../../src/engine/types";
import { ADT_A01_V2_5, ORU_R01_V2_5 } from "./fixtures";

// A group occurrence by its ID; its name is checked where a test names it.
const g = (id: string, ...children: SegmentMatch[]) => ({
  children,
  id,
  name: expect.any(String),
});

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
  it("has no edits, and groups the message as the runner does", () => {
    const input = "MSH PID OBR OBX OBX NTE OBR OBX".split(" ");
    const result = runner(ORU_R01_V2_5, input);

    expect(result.type).toBe("matched");
    expect(repair(ORU_R01_V2_5, input)).toEqual({
      edits: [],
      groups: result.type === "matched" ? result.groups : undefined,
    });
  });

  it("has no edits for a Z-segment the schema does not name", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH EVN PID PV1 ZPI AL1").edits).toEqual([]);
  });
});

describe("repair: missing segments", () => {
  it("reports a segment the schema requires as missing, before the segment it precedes, in the groups it belongs in", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBX OBX").edits).toEqual([
      {
        index: 2,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports every missing segment, not only the first", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH PID AL1").edits).toEqual([
      { index: 1, path: [], segment: "EVN", type: "missing" },
      { index: 2, path: [], segment: "PV1", type: "missing" },
    ]);
  });

  it("reports a segment missing at the end with the input length as its index", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID").edits).toEqual([
      {
        index: 2,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports every segment of an empty message's required elements as missing", () => {
    expect(repair(schemaOf(segment("MSH"), segment("PID")), []).edits).toEqual([
      { index: 0, path: [], segment: "MSH", type: "missing" },
      { index: 0, path: [], segment: "PID", type: "missing" },
    ]);
  });

  it("groups the segments around a missing one, which has no index", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBX OBX").groups).toEqual([
      0,
      g(
        "PATIENT_RESULT",
        g("PATIENT", 1),
        g("ORDER_OBSERVATION", g("OBSERVATION", 2), g("OBSERVATION", 3))
      ),
    ]);
  });

  it("names a missing Hxx as the schema names it", () => {
    const schema = schemaOf(segment("MSH"), segment("Hxx"));
    expect(repair(schema, ["MSH"]).edits).toEqual([
      { index: 1, path: [], segment: "Hxx", type: "missing" },
    ]);
  });
});

describe("repair: unexpected segments", () => {
  it("reports a segment the schema does not allow there as unexpected, in the groups of the segment before it", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBR OBX PV1 OBX").edits).toEqual([
      {
        index: 4,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION", "OBSERVATION"],
        segment: "PV1",
        type: "unexpected",
      },
    ]);
  });

  it("groups an unexpected segment right after the segment before it, and later segments where they fit", () => {
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBR OBX PV1 OBX").groups).toEqual([
      0,
      g(
        "PATIENT_RESULT",
        g("PATIENT", 1),
        g("ORDER_OBSERVATION", 2, g("OBSERVATION", 3, 4), g("OBSERVATION", 5))
      ),
    ]);
  });

  it("reports a segment after the end of the message as unexpected", () => {
    const schema = schemaOf(segment("MSH"), segment("PID"));
    expect(repair(schema, ["MSH", "PID", "PID"]).edits).toEqual([
      { index: 2, path: [], segment: "PID", type: "unexpected" },
    ]);
  });

  it("reports a Z-segment the schema does not name as unexpected when Z-segments are not allowed", () => {
    expect(
      repair(ADT_A01_V2_5, "MSH EVN PID PV1 ZPI AL1".split(" "), {
        allowZSegments: false,
      }).edits
    ).toEqual([{ index: 4, path: [], segment: "ZPI", type: "unexpected" }]);
  });
});

describe("repair: the repair it chooses", () => {
  it("prefers a missing segment to an unexpected one when both cost one edit", () => {
    // Removing the ORC also makes the message fit.
    expect(repairOf(ORU_R01_V2_5, "MSH PID OBR OBX ORC OBX").edits).toEqual([
      {
        index: 5,
        path: ["PATIENT_RESULT", "ORDER_OBSERVATION"],
        segment: "OBR",
        type: "missing",
      },
    ]);
  });

  it("reports a segment out of place next to the schema segment it displaces", () => {
    expect(repairOf(ADT_A01_V2_5, "MSH PIDX PV").edits).toEqual([
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
    expect(repair(schema, ["MSH", "B"]).edits).toEqual([
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
    expect(repair(schema, ["MSH"]).edits).toEqual([
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
