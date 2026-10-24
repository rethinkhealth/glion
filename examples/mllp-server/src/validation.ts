import { AckApplicationError, Hl7ErrorCode } from "@glion/ack";
import type { Context } from "@glion/mllp";

/** The HL7 error code (Table 0357) for a finding of each lint rule. */
const errorCodes: Readonly<Record<string, Hl7ErrorCode>> = {
  "field-max-length": Hl7ErrorCode.DataTypeError,
  "required-components": Hl7ErrorCode.RequiredFieldMissing,
  "required-fields": Hl7ErrorCode.RequiredFieldMissing,
  "segment-order": Hl7ErrorCode.SegmentSequenceError,
  "table-values": Hl7ErrorCode.TableValueNotFound,
  timestamps: Hl7ErrorCode.DataTypeError,
};

/**
 * The message in `ctx`, annotated and linted against its HL7v2 version.
 *
 * @throws {AckApplicationError} When a lint rule reports an error. MSA-3 is
 *   the first error's text, which never holds a value from the message.
 */
export async function validate(ctx: Context) {
  const tree = await ctx.tree();
  const error = ctx.file.messages.find((message) => message.fatal);
  if (error) {
    throw new AckApplicationError(error.reason, {
      errorCode: errorCodes[error.ruleId ?? ""],
    });
  }
  return tree;
}
