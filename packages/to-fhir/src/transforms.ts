import type { TransformName } from "./types";

/** A converted value, or the cause the raw value could not be converted. */
export type TransformResult =
  | { ok: true; value: string }
  | { ok: false; cause: TransformName };

const DATE = /^(\d{4})(\d{2})?(\d{2})?$/;
const DATETIME = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/;

/** An HL7v2 DT as a FHIR `date`, to the precision the HL7v2 value carries. */
function hl7Date(raw: string): TransformResult {
  const parts = DATE.exec(raw);
  if (!parts) {
    return { cause: "hl7-date", ok: false };
  }
  const [, year, month, day] = parts;
  if (month === undefined) {
    return { ok: true, value: year as string };
  }
  if (day === undefined) {
    return { ok: true, value: `${year}-${month}` };
  }
  return { ok: true, value: `${year}-${month}-${day}` };
}

/**
 * An HL7v2 DTM as a FHIR `dateTime`, to the precision the HL7v2 value carries.
 *
 * The offset HL7v2 allows in DTM is not read (no FHIR element in this schema
 * takes a zoned value).
 */
function hl7DateTime(raw: string): TransformResult {
  const parts = DATETIME.exec(raw);
  if (!parts) {
    return { cause: "hl7-datetime", ok: false };
  }
  const [, year, month, day, hour, minute, second] = parts;
  if (hour === undefined) {
    return { ok: true, value: `${year}-${month}-${day}` };
  }
  const time = `${hour}:${minute ?? "00"}:${second ?? "00"}`;
  return { ok: true, value: `${year}-${month}-${day}T${time}` };
}

/** Apply the named conversion to a raw HL7v2 value. */
export function applyTransform(
  name: TransformName,
  raw: string
): TransformResult {
  switch (name) {
    case "hl7-date": {
      return hl7Date(raw);
    }
    case "hl7-datetime": {
      return hl7DateTime(raw);
    }
  }
}
