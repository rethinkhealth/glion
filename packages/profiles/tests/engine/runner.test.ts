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
  ADMISSION,
  MASTER_FILE,
  NOTES,
  ORDERS,
  PATHWAYS,
  RESULTS,
  STUDY,
} from "./fixtures";

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
        id: "VISIT",
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

  it("expects no segment after the end of the message", () => {
    expect(runner(RESULTS, ["MSH", "PID", "OBR", "OBX", "DSC", "PID"])).toEqual(
      { expected: [], index: 5, type: "mismatched" }
    );
  });
});

describe("runner: grouping", () => {
  it("gives each group occurrence its ID and its name", () => {
    expect(match(RESULTS, "MSH PID OBR")).toEqual([
      0,
      {
        children: [
          { children: [1], id: "PATIENT", name: "Patient" },
          { children: [2], id: "ORDER", name: "Order" },
        ],
        id: "REPORT",
        name: "Report",
      },
    ]);
  });

  it("nests each group inside the group that contains it", () => {
    expect(match(RESULTS, "MSH PID PV1 ORC OBR OBX OBX")).toEqual([
      0,
      g(
        "REPORT",
        g("PATIENT", 1, g("VISIT", 2)),
        g("ORDER", 3, 4, g("OBSERVATION", 5), g("OBSERVATION", 6))
      ),
    ]);
  });

  it("names groups at every depth of a five-level schema", () => {
    expect(match(PATHWAYS, "MSH PID PTH PRB ORC OBR OBX")).toEqual([
      0,
      1,
      g(
        "PATHWAY",
        2,
        g("PROBLEM", 3, g("ORDER", 4, g("DETAIL", 5, g("RESULT", 6))))
      ),
    ]);
  });

  it("starts a new group occurrence when the group's first segment repeats", () => {
    expect(match(ADMISSION, "MSH EVN PID PV1 IN1 IN2 IN1 ACC")).toEqual([
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
    const study = (...children: SegmentMatch[]) => [
      0,
      1,
      g("STUDY", ...children),
    ];

    expect(match(STUDY, "MSH PID ORC OBR OBX ORC RXA RXR")).toEqual(
      study(g("TEST", 2, 3, 4), g("DOSE", 5, g("ADMIN", 6, 7)))
    );
    expect(match(STUDY, "MSH PID ORC OBR OBX ORC OBR OBX ORC RXA RXR")).toEqual(
      study(
        g("TEST", 2, 3, 4),
        g("TEST", 5, 6, 7),
        g("DOSE", 8, g("ADMIN", 9, 10))
      )
    );
  });

  it("continues the current group where the schema also allows a new enclosing one", () => {
    expect(match(RESULTS, "MSH PID OBR OBX ORC OBR")).toEqual([
      0,
      g(
        "REPORT",
        g("PATIENT", 1),
        g("ORDER", 2, g("OBSERVATION", 3)),
        g("ORDER", 4, 5)
      ),
    ]);
  });

  describe("a second order, which may start a new order or a new report", () => {
    // PATIENT is optional in each REPORT, so both readings fit. A new REPORT
    // starts only with a PID, as HAPI groups an ORU_R01's PATIENT_RESULT.

    it("puts a second order that starts with ORC in the same report", () => {
      expect(match(RESULTS, "MSH PID OBR OBX ORC OBR OBX")).toEqual([
        0,
        g(
          "REPORT",
          g("PATIENT", 1),
          g("ORDER", 2, g("OBSERVATION", 3)),
          g("ORDER", 4, 5, g("OBSERVATION", 6))
        ),
      ]);
    });

    it("puts a second order that starts with OBR in the same report", () => {
      expect(match(RESULTS, "MSH PID OBR OBX OBR OBX")).toEqual([
        0,
        g(
          "REPORT",
          g("PATIENT", 1),
          g("ORDER", 2, g("OBSERVATION", 3)),
          g("ORDER", 4, g("OBSERVATION", 5))
        ),
      ]);
    });

    it("keeps orders without any PID in one report", () => {
      expect(match(RESULTS, "MSH OBR OBX OBR OBX")).toEqual([
        0,
        g(
          "REPORT",
          g("ORDER", 1, g("OBSERVATION", 2)),
          g("ORDER", 3, g("OBSERVATION", 4))
        ),
      ]);
    });

    it("starts a new report with a PID", () => {
      expect(match(RESULTS, "MSH PID OBR OBX PID OBR OBX")).toEqual([
        0,
        g("REPORT", g("PATIENT", 1), g("ORDER", 2, g("OBSERVATION", 3))),
        g("REPORT", g("PATIENT", 4), g("ORDER", 5, g("OBSERVATION", 6))),
      ]);
    });
  });

  it("accepts any one alternative of a choice without adding a group", () => {
    expect(match(ORDERS, "MSH PID ORC RXO")).toEqual([
      0,
      1,
      g("ORDER", 2, g("DETAIL", 3)),
    ]);
    expect(match(ORDERS, "MSH PID ORC OBR")).toEqual([
      0,
      1,
      g("ORDER", 2, g("DETAIL", 3)),
    ]);
  });

  it("rejects two alternatives of a choice that occurs once", () => {
    expect(match(ORDERS, "MSH PID ORC OBR RXO")).toBeUndefined();
  });

  it("leaves out a group occurrence that holds no segment", () => {
    expect(match(NOTES, "MSH ORC OBR NTE")).toEqual([
      0,
      g("REPORT", g("ORDER", 1, 2, 3)),
    ]);
  });

  it("matches any segment where the schema has Hxx", () => {
    expect(match(MASTER_FILE, "MSH MFI MFE ZL7")).toEqual([
      0,
      1,
      g("MF", 2, 3),
    ]);
  });

  it("forms no groups when a required segment is missing", () => {
    expect(runner(RESULTS, ["MSH", "PID"]).type).toBe("incomplete");
  });

  it("forms no groups for an empty message", () => {
    expect(runner(RESULTS, []).type).toBe("incomplete");
  });

  it("forms no groups for a segment the schema does not allow there", () => {
    expect(runner(RESULTS, ["MSH", "PID", "OBR", "MSH"])).toMatchObject({
      index: 3,
      type: "mismatched",
    });
  });
});

describe("runner: Z-segments", () => {
  it("groups a Z-segment the schema does not name right after the segment before it, in that segment's group", () => {
    expect(match(RESULTS, "MSH PID ZPI OBR ZDS OBX ZRS ORC OBR OBX")).toEqual([
      0,
      g(
        "REPORT",
        g("PATIENT", 1, 2),
        g("ORDER", 3, 4, g("OBSERVATION", 5, 6)),
        g("ORDER", 7, 8, g("OBSERVATION", 9))
      ),
    ]);
  });

  it("keeps consecutive Z-segments together, in order", () => {
    expect(match(ADMISSION, "MSH ZA1 ZA2 EVN PID PV1 IN1 ZI1 ZI2")).toEqual([
      0,
      1,
      2,
      3,
      4,
      5,
      g("INSURANCE", 6, 7, 8),
    ]);
  });

  it("places a Z-segment before the first segment, or after the last, at the top level", () => {
    expect(match(ADMISSION, "ZA1 MSH EVN PID PV1 ZA2")).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it("forms no group occurrence that holds only Z-segments", () => {
    expect(match(RESULTS, "MSH ZA1 OBR OBX")).toEqual([
      0,
      1,
      g("REPORT", g("ORDER", 2, g("OBSERVATION", 3))),
    ]);
  });

  it("reports a Z-segment the schema does not name as a mismatch when Z-segments are not allowed", () => {
    expect(
      runner(ADMISSION, ["MSH", "EVN", "ZA1", "PID", "PV1"], {
        allowZSegments: false,
      })
    ).toEqual({ expected: ["PID"], index: 2, type: "mismatched" });
  });

  it("still reports a Z-segment the schema names where the schema does not allow it", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("ZPV", { optional: true }),
      segment("PID")
    );

    expect(runner(schema, ["MSH", "PID", "ZPV"])).toEqual({
      expected: [],
      index: 2,
      type: "mismatched",
    });
  });

  it("lets an Hxx take a Z-segment before passing over it", () => {
    const schema = schemaOf(segment("MSH"), {
      elements: [segment("Hxx")],
      id: "QUERY",
      name: "QUERY",
      optional: true,
      repeating: false,
      type: "group",
    });

    expect(match(schema, "MSH ZQ1")).toEqual([0, g("QUERY", 1)]);
  });

  it("keeps the schema's priorities between a reading that takes a Z-segment in an Hxx and one that passes over it", () => {
    const schema = schemaOf(
      segment("MSH"),
      segment("A", { optional: true }),
      {
        elements: [segment("Hxx")],
        id: "QUERY",
        name: "QUERY",
        optional: true,
        repeating: true,
        type: "group",
      },
      segment("A", { optional: true })
    );

    // Entering the first optional A outranks skipping it, and that reading
    // passes over ZQ1 before its A.
    expect(match(schema, "MSH ZQ1 A")).toEqual([0, 1, 2]);
  });

  it("reports a later mismatch by its index in the input, Z-segments included", () => {
    expect(runner(RESULTS, ["MSH", "PID", "ZPI", "OBX"])).toEqual({
      expected: ["OBR", "ORC", "PD1", "PV1"],
      index: 3,
      type: "mismatched",
    });
  });
});

describe("runner: a schema run more than once", () => {
  it("gives a run after a mismatch the same result as a run on a fresh copy", () => {
    const schema = { ...RESULTS };
    const message = ["MSH", "PID", "OBR", "OBX", "ORC", "OBR", "OBX"];

    expect(runner(schema, ["MSH", "PID", "OBX"]).type).toBe("mismatched");
    expect(runner(schema, message)).toEqual(runner({ ...RESULTS }, message));
  });
});

describe("runner: schema size", () => {
  it("runs a schema of 100,000 optional segments in a row", () => {
    const schema = schemaOf(
      segment("MSH"),
      ...Array.from({ length: 100_000 }, (_, index) =>
        segment(`S${index}`, { optional: true })
      ),
      segment("PID")
    );

    expect(match(schema, "MSH PID")).toEqual([0, 1]);
  });
});

describe("runner agrees with the reference parser", () => {
  const MESSAGES_PER_STRUCTURE = 300;
  const schemas = [
    RESULTS,
    PATHWAYS,
    ADMISSION,
    STUDY,
    ORDERS,
    NOTES,
    MASTER_FILE,
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
