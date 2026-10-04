import {
  nearMiss,
  referenceMatch,
  seeded,
  validMessage,
} from "../../scripts/check-bundle.mjs";
import { matchStructure } from "../../src/structure/match";
import type {
  MessageStructure,
  StructureMatch,
} from "../../src/structure/types";
import {
  ADT_A01_V2_5,
  CSU_C09_V2_5,
  MFN_M01_V2_5,
  ORM_O01_V2_5,
  ORU_R01_V2_1,
  ORU_R01_V2_5,
  PPP_PCB_V2_3_1,
} from "./fixtures";

const g = (name: string, ...children: StructureMatch[]) => ({
  children,
  name,
});

const match = (structure: MessageStructure, message: string) =>
  matchStructure(structure, message.split(" "));

describe("matchStructure", () => {
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

  it("names groups at every depth of a five-level structure", () => {
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
    const schedule = (...children: StructureMatch[]) => [
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

  it("continues the current group where the structure also allows a new enclosing one", () => {
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

  it("matches any segment where the structure has Hxx", () => {
    expect(match(MFN_M01_V2_5, "MSH MFI MFE ZL7")).toEqual([
      0,
      1,
      g("MF", 2, 3),
    ]);
  });

  it("returns undefined when a required segment is missing", () => {
    expect(match(ORU_R01_V2_5, "MSH PID")).toBeUndefined();
  });

  it("returns undefined for an empty message", () => {
    expect(matchStructure(ORU_R01_V2_5, [])).toBeUndefined();
  });

  it("returns undefined for a segment the structure does not allow there", () => {
    expect(match(ORU_R01_V2_5, "MSH PID OBR PID")).toBeUndefined();
  });
});

describe("matchStructure agrees with the reference parser", () => {
  const MESSAGES_PER_STRUCTURE = 300;
  const structures = [
    ORU_R01_V2_5,
    ADT_A01_V2_5,
    ORM_O01_V2_5,
    CSU_C09_V2_5,
    MFN_M01_V2_5,
    ORU_R01_V2_1,
    PPP_PCB_V2_3_1,
  ];

  for (const structure of structures) {
    it(`on valid messages and near misses for ${structure.id}`, () => {
      const random = seeded(structure.id.length * 7919);
      const names = [...new Set(validMessage(structure, random)), "ZZ1"];

      for (let n = 0; n < MESSAGES_PER_STRUCTURE; n += 1) {
        const valid = validMessage(structure, random);
        const miss = nearMiss(valid, names, random);

        expect(matchStructure(structure, valid)).toEqual(
          referenceMatch(structure, valid)
        );
        expect(matchStructure(structure, valid)).toBeDefined();
        expect(matchStructure(structure, miss)).toEqual(
          referenceMatch(structure, miss)
        );
      }
    });
  }
});
