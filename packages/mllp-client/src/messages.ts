/**
 * Encoding a message to send, and decoding the acknowledgment that answers it.
 * Pure.
 *
 * @module
 */

import { isAckNakCode, isAckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes, encodeBytes } from "@glion/util-charset";

import {
  MllpInvalidMessageError,
  MllpInvalidResponseError,
  nakException,
} from "./errors";
import type { MllpClientResponse } from "./types";
import { read } from "./utils";

/** A message ready to go out. */
export interface EncodingResponse {
  /** MSH-10, which the acknowledgment echoes in MSA-2. */
  readonly controlId: string;
  /** The message in canonical HL7v2, encoded. Framing belongs to the connection. */
  readonly bytes: Uint8Array;
}

/**
 * `tree` as the message to send, in canonical HL7v2.
 *
 * @throws {MllpInvalidMessageError} The message has no MSH-10, or it could not
 *   be serialized or encoded.
 */
export function encode(tree: Root): EncodingResponse {
  const controlId = read(tree, "MSH-10[1].1.1");
  if (controlId === "") {
    throw new MllpInvalidMessageError(
      "the message has no MSH-10 control ID, so its acknowledgment could not be matched"
    );
  }

  try {
    return { bytes: encodeBytes(toHl7v2(tree)), controlId };
  } catch (error) {
    throw new MllpInvalidMessageError(error);
  }
}

/**
 * `bytes` as the acknowledgment of the message `controlId` identifies.
 *
 * MSA-2 is checked before MSA-1 is read: an accept or a NAK is reported only
 * for the message it answers. MSH-9 and the HL7 version are not checked
 * (#668).
 *
 * @throws {AckException} MSA-1 refused the message. The remote system
 *   understood it.
 * @throws {MllpInvalidResponseError} Not a usable acknowledgment of this
 *   message: unreadable bytes, an MSA-1 outside Table 0008, or an MSA-2
 *   naming another message.
 */
export function decode(
  bytes: Uint8Array,
  controlId: string
): MllpClientResponse {
  let raw: string;
  let tree: Root;
  try {
    raw = decodeBytes(bytes);
    tree = parseHL7v2(raw);
  } catch (error) {
    throw new MllpInvalidResponseError(error, controlId);
  }

  const answers = read(tree, "MSA-2[1].1.1");
  if (answers !== controlId) {
    throw new MllpInvalidResponseError(
      `MSA-2 is "${answers}", so it answers a different message — usually a late acknowledgment from an earlier timed-out send.`,
      controlId
    );
  }

  const code = read(tree, "MSA-1[1].1.1");
  if (isAckNakCode(code)) {
    throw nakException(tree, code);
  }
  if (!isAckSuccessCode(code)) {
    throw new MllpInvalidResponseError(
      code === ""
        ? "MSA-1 is empty, so accept or reject cannot be determined."
        : `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`,
      controlId
    );
  }

  return {
    code,
    controlId: answers,
    // MSH-10 of the acknowledgment itself. MUST NOT be used for correlation.
    id: read(tree, "MSH-10[1].1.1"),
    raw,
    text: read(tree, "MSA-3[1].1.1") || undefined,
    tree,
  };
}
