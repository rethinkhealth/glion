import type { Precision } from "./precision";

/**
 * A value {@link formatDT}, {@link formatTM}, or {@link formatDTM} cannot
 * write: it does not give a field its precision includes.
 */
export class TimestampPrecisionError extends Error {
  override readonly name = "TimestampPrecisionError";
  /** The field the value does not give, such as `minute`. */
  readonly field: Precision;
  /** The precision of the value, such as `second`. */
  readonly precision: Precision;

  constructor(field: Precision, precision: Precision) {
    super(
      "The value does not give a field its precision includes; a DT, TM, or DTM gives every field from its first down to its precision."
    );
    this.field = field;
    this.precision = precision;
  }
}

/**
 * An offset from UTC {@link nowDTM} cannot write as `+/-HHMM`, such as the
 * `-00:44:30` of `Africa/Monrovia` before 1972.
 */
export class TimestampOffsetError extends Error {
  override readonly name = "TimestampOffsetError";
  /** The offset as Intl writes it, such as `GMT-00:44:30`. */
  readonly offset: string;

  constructor(offset: string) {
    super(
      "The time zone's offset from UTC at this moment is not in whole minutes; HL7v2 writes an offset as `+/-HHMM`."
    );
    this.offset = offset;
  }
}
