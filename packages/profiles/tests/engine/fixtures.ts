// The event schemas the engine tests run on, written here rather than taken
// from the bundled profiles. Each is small, shows its structure in the
// standard's notation, and exists for the structure it names.

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
  name: string,
  elements: EventSchemaElement[],
  { optional = false, repeating = false }: Occurrence = {}
): EventSchemaElement => ({
  elements,
  id,
  name,
  optional,
  repeating,
  type: "group",
});

const choice = (
  alternatives: EventSchemaElement[],
  { optional = false, repeating = false }: Occurrence = {}
): EventSchemaElement => ({
  alternatives,
  optional,
  repeating,
  type: "choice",
});

/**
 * Results for one or more patients, each optionally named by a PID:
 *
 *     MSH
 *     { REPORT:
 *         [ PATIENT: PID [PD1] [ VISIT: PV1 [PV2] ] ]
 *         { ORDER: [ORC] OBR [{ NTE }] [{ OBSERVATION: OBX [{ NTE }] }] }
 *     }
 *     [DSC]
 *
 * PATIENT is optional, so an order after a result may start a new ORDER or a
 * new REPORT: the ambiguity the runner's priorities resolve.
 */
export const RESULTS: EventSchema = {
  elements: [
    segment("MSH"),
    group(
      "REPORT",
      "Report",
      [
        group(
          "PATIENT",
          "Patient",
          [
            segment("PID"),
            segment("PD1", { optional: true }),
            group(
              "VISIT",
              "Visit",
              [segment("PV1"), segment("PV2", { optional: true })],
              {
                optional: true,
              }
            ),
          ],
          { optional: true }
        ),
        group(
          "ORDER",
          "Order",
          [
            segment("ORC", { optional: true }),
            segment("OBR"),
            segment("NTE", { optional: true, repeating: true }),
            group(
              "OBSERVATION",
              "Observation",
              [
                segment("OBX"),
                segment("NTE", { optional: true, repeating: true }),
              ],
              { optional: true, repeating: true }
            ),
          ],
          { repeating: true }
        ),
      ],
      { repeating: true }
    ),
    segment("DSC", { optional: true }),
  ],
  id: "RESULTS",
};

/**
 * Groups five levels deep:
 *
 *     MSH PID
 *     { PATHWAY: PTH { PROBLEM: PRB [{ ORDER: ORC [ DETAIL: OBR [{ RESULT: OBX }] ] }] } }
 */
export const PATHWAYS: EventSchema = {
  elements: [
    segment("MSH"),
    segment("PID"),
    group(
      "PATHWAY",
      "Pathway",
      [
        segment("PTH"),
        group(
          "PROBLEM",
          "Problem",
          [
            segment("PRB"),
            group(
              "ORDER",
              "Order",
              [
                segment("ORC"),
                group(
                  "DETAIL",
                  "Detail",
                  [
                    segment("OBR"),
                    group("RESULT", "Result", [segment("OBX")], {
                      optional: true,
                      repeating: true,
                    }),
                  ],
                  { optional: true }
                ),
              ],
              { optional: true, repeating: true }
            ),
          ],
          { repeating: true }
        ),
      ],
      { repeating: true }
    ),
  ],
  id: "PATHWAYS",
};

/**
 * An admission with a repeating group whose first segment starts each
 * occurrence:
 *
 *     MSH EVN PID PV1 [{ INSURANCE: IN1 [IN2] }] [ACC]
 */
export const ADMISSION: EventSchema = {
  elements: [
    segment("MSH"),
    segment("EVN"),
    segment("PID"),
    segment("PV1"),
    group(
      "INSURANCE",
      "Insurance",
      [segment("IN1"), segment("IN2", { optional: true })],
      {
        optional: true,
        repeating: true,
      }
    ),
    segment("ACC", { optional: true }),
  ],
  id: "ADMISSION",
};

/**
 * Two groups that both start with an optional ORC, so only the segment after
 * an ORC decides which group it opens:
 *
 *     MSH PID
 *     { STUDY: [{ TEST: [ORC] OBR { OBX } }] [{ DOSE: [ORC] { ADMIN: RXA [RXR] } }] }
 */
export const STUDY: EventSchema = {
  elements: [
    segment("MSH"),
    segment("PID"),
    group(
      "STUDY",
      "Study",
      [
        group(
          "TEST",
          "Test",
          [
            segment("ORC", { optional: true }),
            segment("OBR"),
            segment("OBX", { repeating: true }),
          ],
          { optional: true, repeating: true }
        ),
        group(
          "DOSE",
          "Dose",
          [
            segment("ORC", { optional: true }),
            group(
              "ADMIN",
              "Admin",
              [segment("RXA"), segment("RXR", { optional: true })],
              {
                repeating: true,
              }
            ),
          ],
          { optional: true, repeating: true }
        ),
      ],
      { repeating: true }
    ),
  ],
  id: "STUDY",
};

/**
 * An order whose detail is one of two segments:
 *
 *     MSH PID { ORDER: ORC [ DETAIL: < OBR | RXO > ] }
 */
export const ORDERS: EventSchema = {
  elements: [
    segment("MSH"),
    segment("PID"),
    group(
      "ORDER",
      "Order",
      [
        segment("ORC"),
        group("DETAIL", "Detail", [choice([segment("OBR"), segment("RXO")])], {
          optional: true,
        }),
      ],
      { repeating: true }
    ),
  ],
  id: "ORDERS",
};

/**
 * A required group whose segments are all optional, so an occurrence of it
 * can hold no segment:
 *
 *     MSH { REPORT: [PID] { ORDER: [ORC] OBR [NTE] { OBSERVATION: [OBX] [NTE] } } }
 */
export const NOTES: EventSchema = {
  elements: [
    segment("MSH"),
    group(
      "REPORT",
      "Report",
      [
        segment("PID", { optional: true }),
        group(
          "ORDER",
          "Order",
          [
            segment("ORC", { optional: true }),
            segment("OBR"),
            segment("NTE", { optional: true }),
            group(
              "OBSERVATION",
              "Observation",
              [
                segment("OBX", { optional: true }),
                segment("NTE", { optional: true }),
              ],
              { repeating: true }
            ),
          ],
          { repeating: true }
        ),
      ],
      { repeating: true }
    ),
  ],
  id: "NOTES",
};

/**
 * A master file entry followed by any one segment:
 *
 *     MSH MFI { MF: MFE Hxx }
 */
export const MASTER_FILE: EventSchema = {
  elements: [
    segment("MSH"),
    segment("MFI"),
    group("MF", "Master File", [segment("MFE"), segment("Hxx")], {
      repeating: true,
    }),
  ],
  id: "MASTER_FILE",
};
