import {
  nearMiss,
  referenceMatch,
  seeded,
  validMessage,
} from "../../scripts/check-bundle.mjs";
import { runner } from "../../src/engine/runner";
import type {
  EventSchema,
  EventSchemaElement,
  SegmentMatch,
} from "../../src/engine/types";
import {
  ADT_A01_V2_5,
  CSU_C09_V2_5,
  MFN_M01_V2_5,
  ORM_O01_V2_5,
  ORU_R01_V2_1,
  ORU_R01_V2_5,
  PPP_PCB_V2_3_1,
} from "./fixtures";

const g = (name: string, ...children: SegmentMatch[]) => ({
  children,
  name,
});

const schemaOf = (...elements: EventSchemaElement[]): EventSchema => ({
  elements,
  id: "TEST",
});

const segment = (
  name: string,
  { optional = false, repeating = false } = {}
): EventSchemaElement => ({ name, optional, repeating, type: "segment" });

/** The groups when `message` fits `schema`, else `undefined`. */
const groupsOf = (schema: EventSchema, input: readonly string[]) => {
  const result = runner(schema, input);
  return result.type === "matched" ? result.groups : undefined;
};

const match = (schema: EventSchema, message: string) =>
  groupsOf(schema, message.split(" "));

describe("runner: segment order", () => {
  it("matches segments in the order the schema defines", () => {
    expect(
      runner(schemaOf(segment("MSH"), segment("PID")), ["MSH", "PID"])
    ).toEqual({
      groups: [0, 1],
      type: "matched",
    });
  });

  it("reports the first segment the schema does not allow there, and what it expected", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("EVN"),
      segment("SFT", { optional: true })
    );

    expect(runner(schema, ["MSH", "PID", "EVN"])).toEqual({
      expected: ["EVN"],
      index: 1,
      type: "mismatched",
    });
  });

  it("reports a mismatch at the first segment", () => {
    expect(
      runner(schemaOf(segment("MSH"), segment("PID")), ["PV1", "MSH"])
    ).toEqual({
      expected: ["MSH"],
      index: 0,
      type: "mismatched",
    });
  });

  it("reports an incomplete message, and what can come next", () => {
    expect(runner(schemaOf(segment("MSH"), segment("PID")), ["MSH"])).toEqual({
      expected: ["PID"],
      type: "incomplete",
    });
  });

  it("reports an empty message as incomplete when the schema requires a segment", () => {
    expect(runner(schemaOf(segment("MSH")), [])).toEqual({
      expected: ["MSH"],
      type: "incomplete",
    });
  });

  it("matches a repeating segment any number of times", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("OBX", { repeating: true })
    );

    expect(runner(schema, ["MSH", "OBX"]).type).toBe("matched");
    expect(runner(schema, ["MSH", "OBX", "OBX", "OBX"]).type).toBe("matched");
  });

  it("matches a message with or without an optional segment", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("SFT", { optional: true }),
      segment("EVN")
    );

    expect(runner(schema, ["MSH", "EVN"]).type).toBe("matched");
    expect(runner(schema, ["MSH", "SFT", "EVN"]).type).toBe("matched");
  });

  it("lists every segment that can come next, across optional elements and groups, sorted", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("SFT", { optional: true, repeating: true }),
      {
        elements: [segment("PV1"), segment("PV2", { optional: true })],
        name: "VISIT",
        optional: true,
        repeating: false,
        type: "group",
      },
      segment("DG1")
    );

    expect(runner(schema, ["MSH"])).toEqual({
      expected: ["DG1", "PV1", "SFT"],
      type: "incomplete",
    });
  });

  it("matches exactly one alternative of a choice", () => {
    const schema = schemaOf(segment("ORC"), {
      alternatives: [segment("OBR"), segment("RXO")],
      optional: false,
      repeating: false,
      type: "choice",
    });

    expect(runner(schema, ["ORC", "OBR"]).type).toBe("matched");
    expect(runner(schema, ["ORC", "OBR", "RXO"])).toEqual({
      expected: [],
      index: 2,
      type: "mismatched",
    });
  });

  it("matches any segment in an Hxx position, including one the schema names elsewhere", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("Hxx", { optional: true }),
      segment("RCP")
    );

    expect(runner(schema, ["MSH", "RCP", "RCP"]).type).toBe("matched");
    expect(runner(schema, ["MSH", "ZQP", "RCP"]).type).toBe("matched");
  });

  it("lists Hxx among the expected segments", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("Hxx", { optional: true }),
      segment("RCP")
    );

    expect(runner(schema, ["MSH"])).toEqual({
      expected: ["Hxx", "RCP"],
      type: "incomplete",
    });
  });
});

describe("runner: grouping", () => {
  it("nests each group inside the group that contains it", () => {
    expect(match(ORU_R01_V2_5, "MSH PID PV1 ORC OBR OBX OBX")).toEqual([
      0,
      g(
        "PATIENT_RESULT",
        g("PATIENT", 1, g("VISIT", 2)),
        g("ORDER_OBSERVATION", 3, 4, g("OBSERVATION", 5), g("OBSERVATION", 6))
      ),
    ]);
  });

  it("names groups at every depth of a five-level schema", () => {
    expect(match(PPP_PCB_V2_3_1, "MSH PID PTH PRB ORC OBR OBX")).toEqual([
      0,
      1,
      g(
        "PATHWAY",
        2,
        g(
          "PROBLEM",
          3,
          g("ORDER", 4, g("ORDER_DETAIL", 5, g("ORDER_OBSERVATION", 6)))
        )
      ),
    ]);
  });

  it("starts a new group occurrence when the group's first segment repeats", () => {
    expect(match(ADT_A01_V2_5, "MSH EVN PID PV1 IN1 IN2 IN1 ACC")).toEqual([
      0,
      1,
      2,
      3,
      g("INSURANCE", 4, 5),
      g("INSURANCE", 6),
      7,
    ]);
  });

  it("places a segment by the segments that follow it", () => {
    const schedule = (...children: SegmentMatch[]) => [
      0,
      g("PATIENT", 1, 2, g("STUDY_PHASE", g("STUDY_SCHEDULE", ...children))),
    ];

    expect(match(CSU_C09_V2_5, "MSH PID CSR ORC OBR OBX ORC RXA RXR")).toEqual(
      schedule(
        g("STUDY_OBSERVATION", 3, 4, 5),
        g("STUDY_PHARM", 6, g("RX_ADMIN", 7, 8))
      )
    );
    expect(
      match(CSU_C09_V2_5, "MSH PID CSR ORC OBR OBX ORC OBR OBX ORC RXA RXR")
    ).toEqual(
      schedule(
        g("STUDY_OBSERVATION", 3, 4, 5),
        g("STUDY_OBSERVATION", 6, 7, 8),
        g("STUDY_PHARM", 9, g("RX_ADMIN", 10, 11))
      )
    );
  });

  it("continues the current group where the schema also allows a new enclosing one", () => {
    expect(match(ORU_R01_V2_5, "MSH PID OBR OBX ORC OBR")).toEqual([
      0,
      g(
        "PATIENT_RESULT",
        g("PATIENT", 1),
        g("ORDER_OBSERVATION", 2, g("OBSERVATION", 3)),
        g("ORDER_OBSERVATION", 4, 5)
      ),
    ]);
  });

  it("accepts any one alternative of a choice without adding a group", () => {
    expect(match(ORM_O01_V2_5, "MSH PID ORC RXO")).toEqual([
      0,
      g("PATIENT", 1),
      g("ORDER", 2, g("ORDER_DETAIL", 3)),
    ]);
    expect(match(ORM_O01_V2_5, "MSH PID ORC OBR")).toEqual([
      0,
      g("PATIENT", 1),
      g("ORDER", 2, g("ORDER_DETAIL", 3)),
    ]);
  });

  it("rejects two alternatives of a choice that occurs once", () => {
    expect(match(ORM_O01_V2_5, "MSH PID ORC OBR RXO")).toBeUndefined();
  });

  it("leaves out a group occurrence that holds no segment", () => {
    expect(match(ORU_R01_V2_1, "MSH ORC OBR NTE")).toEqual([
      0,
      g("PATIENT_RESULT", g("ORDER_OBSERVATION", 1, 2, 3)),
    ]);
  });

  it("matches any segment where the schema has Hxx", () => {
    expect(match(MFN_M01_V2_5, "MSH MFI MFE ZL7")).toEqual([
      0,
      1,
      g("MF", 2, 3),
    ]);
  });

  it("forms no groups when a required segment is missing", () => {
    expect(runner(ORU_R01_V2_5, ["MSH", "PID"]).type).toBe("incomplete");
  });

  it("forms no groups for an empty message", () => {
    expect(runner(ORU_R01_V2_5, []).type).toBe("incomplete");
  });

  it("forms no groups for a segment the schema does not allow there", () => {
    expect(runner(ORU_R01_V2_5, ["MSH", "PID", "OBR", "MSH"])).toMatchObject({
      index: 3,
      type: "mismatched",
    });
  });
});

describe("runner agrees with the reference parser", () => {
  const MESSAGES_PER_STRUCTURE = 300;
  const schemas = [
    ORU_R01_V2_5,
    ADT_A01_V2_5,
    ORM_O01_V2_5,
    CSU_C09_V2_5,
    MFN_M01_V2_5,
    ORU_R01_V2_1,
    PPP_PCB_V2_3_1,
  ];

  for (const schema of schemas) {
    it(`on valid messages and near misses for ${schema.id}`, () => {
      const random = seeded(schema.id.length * 7919);
      const names = [...new Set(validMessage(schema, random)), "ZZ1"];

      for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
        const valid = validMessage(schema, random);
        const miss = nearMiss(valid, names, random);

        expect(groupsOf(schema, valid)).toEqual(referenceMatch(schema, valid));
        expect(groupsOf(schema, valid)).toBeDefined();
        expect(groupsOf(schema, miss)).toEqual(referenceMatch(schema, miss));
      }
    });
  }
});
