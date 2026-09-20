// Message structures transcribed from the HL7 v2 XML-encoding schemas
// (xsd:choice blocks kept as choices).
import type {
  MessageStructure,
  Occurrence,
  StructureElement,
} from "../../src/structure/types";

const REQUIRED: Occurrence = { optional: false, repeating: false };
const OPTIONAL: Occurrence = { optional: true, repeating: false };
const REPEATING: Occurrence = { optional: false, repeating: true };
const OPTIONAL_REPEATING: Occurrence = { optional: true, repeating: true };

const segment = (
  name: string,
  occurrence: Occurrence = REQUIRED
): StructureElement => ({ ...occurrence, name, type: "segment" });

const group = (
  name: string,
  elements: StructureElement[],
  occurrence: Occurrence = REQUIRED
): StructureElement => ({ ...occurrence, elements, name, type: "group" });

const choice = (
  alternatives: StructureElement[],
  occurrence: Occurrence = REQUIRED
): StructureElement => ({ ...occurrence, alternatives, type: "choice" });

/** ORU_R01, HL7 v2.5. */
export const ORU_R01_V2_5: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("SFT", OPTIONAL_REPEATING),
    group(
      "PATIENT_RESULT",
      [
        group(
          "PATIENT",
          [
            segment("PID"),
            segment("PD1", OPTIONAL),
            segment("NTE", OPTIONAL_REPEATING),
            segment("NK1", OPTIONAL_REPEATING),
            group(
              "VISIT",
              [segment("PV1"), segment("PV2", OPTIONAL)],
              OPTIONAL
            ),
          ],
          OPTIONAL
        ),
        group(
          "ORDER_OBSERVATION",
          [
            segment("ORC", OPTIONAL),
            segment("OBR"),
            segment("NTE", OPTIONAL_REPEATING),
            group(
              "TIMING_QTY",
              [segment("TQ1"), segment("TQ2", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
            segment("CTD", OPTIONAL),
            group(
              "OBSERVATION",
              [segment("OBX"), segment("NTE", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
            segment("FT1", OPTIONAL_REPEATING),
            segment("CTI", OPTIONAL_REPEATING),
            group(
              "SPECIMEN",
              [segment("SPM"), segment("OBX", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
          ],
          REPEATING
        ),
      ],
      REPEATING
    ),
    segment("DSC", OPTIONAL),
  ],
  id: "ORU_R01",
};

/** ADT_A01, HL7 v2.5. */
export const ADT_A01_V2_5: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("SFT", OPTIONAL_REPEATING),
    segment("EVN"),
    segment("PID"),
    segment("PD1", OPTIONAL),
    segment("ROL", OPTIONAL_REPEATING),
    segment("NK1", OPTIONAL_REPEATING),
    segment("PV1"),
    segment("PV2", OPTIONAL),
    segment("ROL", OPTIONAL_REPEATING),
    segment("DB1", OPTIONAL_REPEATING),
    segment("OBX", OPTIONAL_REPEATING),
    segment("AL1", OPTIONAL_REPEATING),
    segment("DG1", OPTIONAL_REPEATING),
    segment("DRG", OPTIONAL),
    group(
      "PROCEDURE",
      [segment("PR1"), segment("ROL", OPTIONAL_REPEATING)],
      OPTIONAL_REPEATING
    ),
    segment("GT1", OPTIONAL_REPEATING),
    group(
      "INSURANCE",
      [
        segment("IN1"),
        segment("IN2", OPTIONAL),
        segment("IN3", OPTIONAL_REPEATING),
        segment("ROL", OPTIONAL_REPEATING),
      ],
      OPTIONAL_REPEATING
    ),
    segment("ACC", OPTIONAL),
    segment("UB1", OPTIONAL),
    segment("UB2", OPTIONAL),
    segment("PDA", OPTIONAL),
  ],
  id: "ADT_A01",
};

/** ORM_O01, HL7 v2.5. */
export const ORM_O01_V2_5: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("NTE", OPTIONAL_REPEATING),
    group(
      "PATIENT",
      [
        segment("PID"),
        segment("PD1", OPTIONAL),
        segment("NTE", OPTIONAL_REPEATING),
        group(
          "PATIENT_VISIT",
          [segment("PV1"), segment("PV2", OPTIONAL)],
          OPTIONAL
        ),
        group(
          "INSURANCE",
          [segment("IN1"), segment("IN2", OPTIONAL), segment("IN3", OPTIONAL)],
          OPTIONAL_REPEATING
        ),
        segment("GT1", OPTIONAL),
        segment("AL1", OPTIONAL_REPEATING),
      ],
      OPTIONAL
    ),
    group(
      "ORDER",
      [
        segment("ORC"),
        group(
          "ORDER_DETAIL",
          [
            choice([
              segment("OBR"),
              segment("RQD"),
              segment("RQ1"),
              segment("RXO"),
              segment("ODS"),
              segment("ODT"),
            ]),
            segment("NTE", OPTIONAL_REPEATING),
            segment("CTD", OPTIONAL),
            segment("DG1", OPTIONAL_REPEATING),
            group(
              "OBSERVATION",
              [segment("OBX"), segment("NTE", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
          ],
          OPTIONAL
        ),
        segment("FT1", OPTIONAL_REPEATING),
        segment("CTI", OPTIONAL_REPEATING),
        segment("BLG", OPTIONAL),
      ],
      REPEATING
    ),
  ],
  id: "ORM_O01",
};

/** CSU_C09, HL7 v2.5. */
export const CSU_C09_V2_5: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("SFT", OPTIONAL_REPEATING),
    group(
      "PATIENT",
      [
        segment("PID"),
        segment("PD1", OPTIONAL),
        segment("NTE", OPTIONAL_REPEATING),
        group("VISIT", [segment("PV1"), segment("PV2", OPTIONAL)], OPTIONAL),
        segment("CSR"),
        group(
          "STUDY_PHASE",
          [
            segment("CSP", OPTIONAL),
            group(
              "STUDY_SCHEDULE",
              [
                segment("CSS", OPTIONAL),
                group(
                  "STUDY_OBSERVATION",
                  [
                    segment("ORC", OPTIONAL),
                    segment("OBR"),
                    group(
                      "TIMING_QTY",
                      [segment("TQ1"), segment("TQ2", OPTIONAL_REPEATING)],
                      OPTIONAL_REPEATING
                    ),
                    segment("OBX", REPEATING),
                  ],
                  REPEATING
                ),
                group(
                  "STUDY_PHARM",
                  [
                    segment("ORC", OPTIONAL),
                    group(
                      "RX_ADMIN",
                      [segment("RXA"), segment("RXR")],
                      REPEATING
                    ),
                  ],
                  REPEATING
                ),
              ],
              REPEATING
            ),
          ],
          REPEATING
        ),
      ],
      REPEATING
    ),
  ],
  id: "CSU_C09",
};

/** MFN_M01, HL7 v2.5. */
export const MFN_M01_V2_5: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("SFT", OPTIONAL_REPEATING),
    segment("MFI"),
    group("MF", [segment("MFE"), segment("Hxx", OPTIONAL)], REPEATING),
  ],
  id: "MFN_M01",
};

/** ORU_R01, HL7 v2.1. */
export const ORU_R01_V2_1: MessageStructure = {
  elements: [
    segment("MSH"),
    group(
      "PATIENT_RESULT",
      [
        group(
          "PATIENT",
          [
            segment("PID"),
            segment("NTE", OPTIONAL_REPEATING),
            segment("PV1", OPTIONAL),
          ],
          OPTIONAL
        ),
        group(
          "ORDER_OBSERVATION",
          [
            segment("ORC", OPTIONAL),
            segment("OBR"),
            segment("NTE", OPTIONAL_REPEATING),
            group(
              "OBSERVATION",
              [segment("OBX", OPTIONAL), segment("NTE", OPTIONAL_REPEATING)],
              REPEATING
            ),
          ],
          REPEATING
        ),
      ],
      REPEATING
    ),
    segment("DSC", OPTIONAL),
  ],
  id: "ORU_R01",
};

/** PPP_PCB, HL7 v2.3.1. */
export const PPP_PCB_V2_3_1: MessageStructure = {
  elements: [
    segment("MSH"),
    segment("PID"),
    group(
      "PATIENT_VISIT",
      [segment("PV1"), segment("PV2", OPTIONAL)],
      OPTIONAL
    ),
    group(
      "PATHWAY",
      [
        segment("PTH"),
        segment("NTE", OPTIONAL_REPEATING),
        segment("VAR", OPTIONAL_REPEATING),
        group(
          "PATHWAY_ROLE",
          [segment("ROL"), segment("VAR", OPTIONAL_REPEATING)],
          OPTIONAL_REPEATING
        ),
        group(
          "PROBLEM",
          [
            segment("PRB"),
            segment("NTE", OPTIONAL_REPEATING),
            segment("VAR", OPTIONAL_REPEATING),
            group(
              "PROBLEM_ROLE",
              [segment("ROL"), segment("VAR", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
            group(
              "PROBLEM_OBSERVATION",
              [segment("OBX"), segment("NTE", OPTIONAL_REPEATING)],
              OPTIONAL_REPEATING
            ),
            group(
              "GOAL",
              [
                segment("GOL"),
                segment("NTE", OPTIONAL_REPEATING),
                segment("VAR", OPTIONAL_REPEATING),
                group(
                  "GOAL_ROLE",
                  [segment("ROL"), segment("VAR", OPTIONAL_REPEATING)],
                  OPTIONAL_REPEATING
                ),
                group(
                  "GOAL_OBSERVATION",
                  [segment("OBX"), segment("NTE", OPTIONAL_REPEATING)],
                  OPTIONAL_REPEATING
                ),
              ],
              OPTIONAL_REPEATING
            ),
            group(
              "ORDER",
              [
                segment("ORC"),
                group(
                  "ORDER_DETAIL",
                  [
                    choice([segment("OBR"), segment("RXO")]),
                    segment("NTE", OPTIONAL_REPEATING),
                    segment("VAR", OPTIONAL_REPEATING),
                    group(
                      "ORDER_OBSERVATION",
                      [
                        segment("OBX"),
                        segment("NTE", OPTIONAL_REPEATING),
                        segment("VAR", OPTIONAL_REPEATING),
                      ],
                      OPTIONAL_REPEATING
                    ),
                  ],
                  OPTIONAL
                ),
              ],
              OPTIONAL_REPEATING
            ),
          ],
          OPTIONAL_REPEATING
        ),
      ],
      REPEATING
    ),
  ],
  id: "PPP_PCB",
};
