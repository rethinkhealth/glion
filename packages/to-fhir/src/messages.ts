import pluralize from "pluralize";

/**
 * Every finding the compiler reports, one complete sentence per cause.
 *
 * ADR 0026 is the contract: the report site passes an entry to `file.message`
 * and adds no text of its own.
 */
export const messages = {
  dateConversion: (field: string, value: string) =>
    `Field \`${field}\` carries \`${value}\`, which is not an HL7v2 date; an HL7v2 date is \`YYYY\`, \`YYYYMM\` or \`YYYYMMDD\`.`,
  dateTimeConversion: (field: string, value: string) =>
    `Field \`${field}\` carries \`${value}\`, which is not an HL7v2 date/time; an HL7v2 date/time begins \`YYYYMMDD\` and may continue \`HHMM\` or \`HHMMSS\`.`,
  duplicateAnchor: (segmentId: string, slot: string) =>
    `A second \`${segmentId}\` segment in one group would write \`${slot}\` again; the mapping produces one \`${slot}\` resource per group instance.`,
  scopeAbsent: (map: string, scope: string, segmentId: string) =>
    `Segment map \`${map}\` produces one resource per \`${scope}\` group, and the message carries \`${segmentId}\` outside any such group.`,
  terminologyDeclined: (field: string, code: string, v2Table: string) =>
    `Field \`${field}\` carries \`${code}\` from HL7v2 table \`${v2Table}\`, which the HL7 V2-to-FHIR mapping publishes with no FHIR code.`,
  terminologyError: (field: string, code: string, v2Table: string) =>
    `Field \`${field}\` carries \`${code}\` from HL7v2 table \`${v2Table}\`, for which the HL7 V2-to-FHIR mapping requires an error.`,
  terminologyUnknown: (field: string, code: string, v2Table: string) =>
    `Field \`${field}\` carries \`${code}\`, which HL7v2 table \`${v2Table}\` does not define.`,
  unmappedField: (field: string, name: string, value: string) =>
    `Field \`${field}\` (${name}) carries \`${value}\`, and no element of the mapping reads it.`,
  unmappedFieldUnnamed: (field: string, value: string) =>
    `Field \`${field}\` carries \`${value}\`, and no element of the mapping reads it.`,
  unmappedSegment: (segmentId: string, leafCount: number) =>
    `Segment \`${segmentId}\` carries ${pluralize("value", leafCount, true)}, and the mapping has no segment map for it.`,
  unresolvedReference: (resourceType: string, element: string, slot: string) =>
    `The \`${element}\` element of \`${resourceType}\` points at \`${slot}\`, which no resource in an enclosing group fills.`,
} as const;

/** The rule id each finding is reported under. */
export const ruleIds = {
  conversionFailure: "fhir-conversion-failure",
  duplicateAnchor: "fhir-duplicate-anchor",
  scopeAbsent: "fhir-scope-absent",
  terminologyGap: "fhir-terminology-gap",
  unmappedField: "fhir-unmapped-field",
  unmappedSegment: "fhir-unmapped-segment",
  unresolvedReference: "fhir-unresolved-reference",
} as const;

/** The `source` every finding carries. */
export const source = "glion-to-fhir";
