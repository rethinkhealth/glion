/**
 * The exception a NAK carries. Not an {@link MllpClientError}: the remote
 * system understood the message and refused it, and the class is the one
 * `@glion/ack` defines for that MSA-1 code.
 *
 * @module
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  AckCommitError,
  AckCommitReject,
  isAckNakCode,
} from "@glion/ack";
import type { AckException, AckExceptionOptions, AckNakCode } from "@glion/ack";
import type { Root } from "@glion/ast";

import { read } from "../utils";

/** The `@glion/ack` exception class for each NAK code. */
// TODO(#689): replace with the shared reader from @glion/ack once it exists.
const NAK_EXCEPTIONS = {
  [AckCode.ApplicationError]: AckApplicationError,
  [AckCode.ApplicationReject]: AckApplicationReject,
  [AckCode.CommitError]: AckCommitError,
  [AckCode.CommitReject]: AckCommitReject,
} as const;

/** MSA-3, ERR-3, and ERR-4 as one sentence, or a note that none were given. */
function nakMessage(code: AckNakCode, nak: AckExceptionOptions): string {
  const said: string[] = [];
  if (nak.text !== undefined) {
    said.push(nak.text);
  }
  if (nak.errorCode !== undefined) {
    said.push(`ERR-3 ${nak.errorCode}`);
  }
  if (nak.severity !== undefined) {
    said.push(`ERR-4 ${nak.severity}`);
  }
  const reason =
    said.length === 0 ? "It gave no reason." : `${said.join("; ")}.`;
  return `The remote system did not accept message ${nak.controlId} (MSA-1 ${code}). ${reason}`;
}

/**
 * The exception the acknowledgment in `tree` carries, or `undefined` when
 * MSA-1 is not a NAK.
 *
 * Reads MSA-1 for the class, MSA-2 for `controlId`, ERR-3 for `errorCode`,
 * ERR-4 for `severity`, and MSA-3 (or ERR-8) for `text`.
 */
export function nakException(tree: Root): AckException | undefined {
  const code = read(tree, "MSA-1[1].1.1");
  if (!isAckNakCode(code)) {
    return undefined;
  }
  const nak: AckExceptionOptions = {
    controlId: read(tree, "MSA-2[1].1.1"),
    errorCode: read(tree, "ERR-3[1].1.1") || undefined,
    severity: read(tree, "ERR-4[1].1.1") || undefined,
    // ERR-8 stands in for MSA-3 when the remote system left MSA-3 empty.
    text: read(tree, "MSA-3[1].1.1") || read(tree, "ERR-8[1].1.1") || undefined,
  };
  return new NAK_EXCEPTIONS[code](nakMessage(code, nak), nak);
}
