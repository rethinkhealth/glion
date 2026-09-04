/**
 * Two total functions between HL7v2 and the wire.
 *
 * `encode` turns a message into one MLLP frame: parse → read MSH-10 →
 * serialize → UTF-8 → frame. The tree is the wire currency: the bytes written
 * are the canonical serialization of the tree, not an echo of the input. It
 * throws, and `MllpClient.send()` wraps what it throws before anything is
 * posted to the actor.
 *
 * `decode` turns one received frame into what it means for the message that
 * was waiting: UTF-8 → parse → MSA-1 → MSA-2 correlation → MSA-3 / ERR
 * fields, as an {@link AckOutcome}. It never throws — the actor decides on
 * frames from inside a synchronous handler, so a lower layer's failure has to
 * arrive as a value.
 *
 * `decode` trusts MSA-1 / MSA-2 / ERR-3 / ERR-4 as found. It does not check
 * MSH-9, the HL7 version, or the structure of the acknowledgment; that
 * validation is the application's to add.
 *
 * @module
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCode,
  AckCommitError,
  AckCommitReject,
  isAckCode,
  isAckNakCode,
} from "@glion/ack";
import type { AckException, AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import type { MllpClientResponse, SendInput } from "./types";

// TODO(#689): replace with the shared reader from @glion/ack once it exists.
const NAK_EXCEPTIONS = {
  [AckCode.ApplicationError]: AckApplicationError,
  [AckCode.ApplicationReject]: AckApplicationReject,
  [AckCode.CommitError]: AckCommitError,
  [AckCode.CommitReject]: AckCommitReject,
} as const;

/**
 * The message has no MSH-10 control ID, so no acknowledgment could be matched
 * to it.
 */
export class MissingControlIdError extends Error {
  override readonly name = "MissingControlIdError";

  constructor() {
    super(
      "The message has no MSH-10 control ID, so its acknowledgment could not be matched. Set MSH-10 and send again."
    );
  }
}

/** The frame is not the acknowledgment of the message that was waiting. */
export class UnexpectedAcknowledgmentError extends Error {
  override readonly name = "UnexpectedAcknowledgmentError";
}

export interface EncodedMessage {
  /** The complete MLLP frame, ready for a single write. */
  readonly framed: Uint8Array;
  /** MSH-10, which the acknowledgment's MSA-2 must echo. */
  readonly controlId: string;
}

/**
 * What one received frame turned out to be.
 *
 * - `accepted`: the remote system took the message (MSA-1 `AA` or `CA`).
 * - `rejected`: it understood the message and said no. The exception is the
 *   `@glion/ack` one for the NAK code, ready to throw; the connection is still
 *   in step, because the remote system answered properly.
 * - `invalid`: the frame is not a usable acknowledgment of this message. `cause`
 *   is the lower layer's error, or this module's own.
 */
export type AckOutcome =
  | { readonly kind: "accepted"; readonly response: MllpClientResponse }
  | { readonly kind: "rejected"; readonly exception: AckException }
  | { readonly kind: "invalid"; readonly cause: unknown };

/**
 * Encode one message for the wire.
 *
 * @throws {MissingControlIdError} The message has no MSH-10.
 * @throws The parser's, serializer's, charset's, or framing error, as is.
 */
export function encode(input: SendInput): EncodedMessage {
  const tree = typeof input === "string" ? parseHL7v2(input) : input;

  const controlId = read(tree, "MSH-10[1].1.1");
  if (controlId === "") {
    throw new MissingControlIdError();
  }

  const text = toHl7v2(tree);
  const bytes = encodeBytes(text);
  const framed = frame(bytes);
  return { controlId, framed };
}

/**
 * Decode one received frame as the acknowledgment of the message sent with
 * `expectedControlId`. Never throws: a charset, parser, or correlation
 * failure comes back as `invalid`.
 */
export function decode(
  bytes: Uint8Array,
  expectedControlId: string
): AckOutcome {
  try {
    return readAcknowledgment(bytes, expectedControlId);
  } catch (error) {
    // The only totality boundary in the package. Whatever the charset layer,
    // the parser, or the correlation checks below raise becomes a value here,
    // because the actor reads frames from inside a synchronous handler that
    // must not throw.
    return { cause: error, kind: "invalid" };
  }
}

function readAcknowledgment(
  bytes: Uint8Array,
  expectedControlId: string
): AckOutcome {
  const raw = decodeBytes(bytes);
  const tree = parseHL7v2(raw);

  const code = read(tree, "MSA-1[1].1.1");
  if (code === "") {
    throw new UnexpectedAcknowledgmentError(
      "MSA-1 is empty, so accept or reject cannot be determined."
    );
  }
  if (!isAckCode(code)) {
    throw new UnexpectedAcknowledgmentError(
      `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`
    );
  }

  const controlId = read(tree, "MSA-2[1].1.1");
  if (controlId === "") {
    throw new UnexpectedAcknowledgmentError(
      "MSA-2 is empty, so the acknowledgment cannot be matched to the message."
    );
  }
  if (controlId !== expectedControlId) {
    throw new UnexpectedAcknowledgmentError(
      `MSA-2 is "${controlId}", which does not match the message's MSH-10 "${expectedControlId}". The remote system answered a different message, usually a late acknowledgment from an earlier timed-out send.`
    );
  }

  if (isAckNakCode(code)) {
    return {
      exception: new NAK_EXCEPTIONS[code](
        `The remote system did not accept message ${expectedControlId}: acknowledgment code ${code}.`,
        {
          controlId: expectedControlId,
          errorCode: read(tree, "ERR-3[1].1.1") || undefined,
          severity: read(tree, "ERR-4[1].1.1") || undefined,
          text:
            read(tree, "MSA-3[1].1.1") ||
            read(tree, "ERR-8[1].1.1") ||
            undefined,
        }
      ),
      kind: "rejected",
    };
  }

  return {
    kind: "accepted",
    response: { code: code as AckSuccessCode, raw, tree },
  };
}

/** The value at `path`, or `""` when the field is absent. */
function read(tree: Root, path: string): string {
  return value(tree, path)?.value ?? "";
}
