/** HL7v2 Table 0008 — Acknowledgment codes used in MSA-1. */
export const AckCode = {
  ApplicationAccept: "AA",
  ApplicationError: "AE",
  ApplicationReject: "AR",
  CommitAccept: "CA",
  CommitError: "CE",
  CommitReject: "CR",
} as const;

export type AckCodeValue = (typeof AckCode)[keyof typeof AckCode];

/** Accept codes used as `successCode` in `acknowledge()`. */
export type AckSuccessCode =
  | typeof AckCode.ApplicationAccept
  | typeof AckCode.CommitAccept;

/** Reject/error codes — the NAK half of Table 0008. */
export type AckNakCode =
  | typeof AckCode.ApplicationError
  | typeof AckCode.ApplicationReject
  | typeof AckCode.CommitError
  | typeof AckCode.CommitReject;

/** Narrow an arbitrary string to a Table 0008 acknowledgment code. */
export function isAckCode(value: string): value is AckCodeValue {
  return (
    value === AckCode.ApplicationAccept ||
    value === AckCode.ApplicationError ||
    value === AckCode.ApplicationReject ||
    value === AckCode.CommitAccept ||
    value === AckCode.CommitError ||
    value === AckCode.CommitReject
  );
}

/** Narrow an arbitrary string to a NAK code — the reject half of Table 0008. */
export function isAckNakCode(value: string): value is AckNakCode {
  return (
    value === AckCode.ApplicationError ||
    value === AckCode.ApplicationReject ||
    value === AckCode.CommitError ||
    value === AckCode.CommitReject
  );
}

/**
 * HL7v2 Table 0357 — Message error condition codes used in ERR-3. Stable across
 * all versions (v2.1–v2.9).
 */
export const Hl7ErrorCode = {
  ApplicationInternalError: "207",
  ApplicationRecordLocked: "206",
  DataTypeError: "102",
  DuplicateKeyIdentifier: "205",
  MessageAccepted: "0",
  RequiredFieldMissing: "101",
  SegmentSequenceError: "100",
  TableValueNotFound: "103",
  UnknownKeyIdentifier: "204",
  UnsupportedEventCode: "201",
  UnsupportedMessageType: "200",
  UnsupportedProcessingId: "202",
  UnsupportedVersionId: "203",
} as const;

export type Hl7ErrorCodeValue =
  (typeof Hl7ErrorCode)[keyof typeof Hl7ErrorCode];

/** HL7v2 Table 0516 — Error severity codes used in ERR-4. */
export const Severity = {
  Error: "E",
  Info: "I",
  Warning: "W",
} as const;

export type SeverityValue = (typeof Severity)[keyof typeof Severity];
