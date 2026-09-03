/**
 * Two pure functions between HL7v2 and the wire.
 *
 * `encode` turns a message into one MLLP frame: parse → read MSH-10 →
 * serialize → UTF-8 → frame. The tree is the wire currency: the bytes written
 * are the canonical serialization of the tree, not an echo of the input.
 *
 * `decode` turns one received frame into the acknowledgment it carries:
 * UTF-8 → parse → MSA-1 → MSA-2 correlation → MSA-3 / ERR fields. It reads;
 * it does not judge. Whether the acknowledgment is an accept or a NAK is the
 * caller's to act on.
 *
 * This layer throws its own two errors, defined below, and lets the errors of
 * the layers beneath it (parser, serializer, charset, framing) propagate as
 * they are. The client wraps whatever comes out of here.
 *
 * `decode` trusts MSA-1 / MSA-2 / ERR-3 / ERR-4 as found. It does not check
 * MSH-9, the HL7 version, or the structure of the acknowledgment; that
 * validation is the application's to add.
 *
 * @module
 */

import { isAckCode } from "@glion/ack";
import type { AckCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import type { SendInput } from "./types";

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

/** What an acknowledgment says, as found in its MSA and ERR segments. */
export interface Acknowledgment {
  /** MSA-1. */
  readonly code: AckCode;
  /** The acknowledgment, parsed. */
  readonly tree: Root;
  /** The acknowledgment as received, decoded to text. */
  readonly raw: string;
  /** MSA-3, or ERR-8 when MSA-3 is absent: the remote system's own diagnostic. */
  readonly text?: string;
  /** ERR-3: the HL7 error condition. */
  readonly errorCode?: string;
  /** ERR-4: the severity. */
  readonly severity?: string;
}

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
 * `expectedControlId`.
 *
 * @throws {UnexpectedAcknowledgmentError} MSA-1 is missing or unknown, or
 *   MSA-2 is missing or names another message.
 * @throws The charset's or parser's error, as is.
 */
export function decode(
  bytes: Uint8Array,
  expectedControlId: string
): Acknowledgment {
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

  return {
    code,
    errorCode: read(tree, "ERR-3[1].1.1") || undefined,
    raw,
    severity: read(tree, "ERR-4[1].1.1") || undefined,
    text: read(tree, "MSA-3[1].1.1") || read(tree, "ERR-8[1].1.1") || undefined,
    tree,
  };
}

/** The value at `path`, or `""` when the field is absent. */
function read(tree: Root, path: string): string {
  return value(tree, path)?.value ?? "";
}
