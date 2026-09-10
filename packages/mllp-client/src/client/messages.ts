/**
 * What the client makes of a message going out, and of an acknowledgment
 * coming back.
 *
 * Serializing a tree, reading an MSA, and deciding whether that MSA answers a
 * given message are here.
 *
 * Pure: nothing here knows the client has phases, or that a failure ends the
 * connection.
 *
 * @module
 */

import { isAckNakCode, isAckSuccessCode } from "@glion/ack";
import type { AckException } from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes, encodeBytes } from "@glion/util-charset";

import {
  MllpInvalidMessageError,
  MllpInvalidResponseError,
  nakException,
} from "../errors";
import type { MllpClientResponse } from "../types";
import { read } from "../utils";

/** A message ready to go out. */
export interface EncodingResponse {
  /** MSH-10, which the acknowledgment echoes in MSA-2. */
  readonly controlId: string;
  /** The message in canonical HL7v2, encoded. Framing belongs to the connection. */
  readonly bytes: Uint8Array;
}

/**
 * `tree` as the message to send, in canonical HL7v2 rather than an echo of
 * whatever the caller parsed.
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
 * What the bytes coming back turned out to be: the three things a reply can be
 * to the message it was read for.
 */
export type DecodeResponse =
  /** MSA-1 accepted the message. */
  | { readonly type: "accept"; readonly response: MllpClientResponse }
  /** MSA-1 refused it. The remote system understood the message. */
  | { readonly type: "nak"; readonly exception: AckException }
  /**
   * Not a usable acknowledgment of this message: unreadable bytes, an MSA-1
   * outside Table 0008, or an MSA-2 naming another message.
   */
  | { readonly type: "invalid"; readonly error: MllpInvalidResponseError };

/**
 * `bytes` as the reply to the message `controlId` identifies.
 *
 * MSA-2 is checked before MSA-1 is read, so an accept or a NAK is only ever
 * reported for the message it answers. MSH-9 and the HL7 version are not
 * checked (#668).
 *
 * Total: what to do with each answer is the caller's.
 */
export function decode(bytes: Uint8Array, controlId: string): DecodeResponse {
  let raw: string;
  let tree: Root;
  try {
    raw = decodeBytes(bytes);
    tree = parseHL7v2(raw);
  } catch (error) {
    return invalid(error, controlId);
  }

  const answers = read(tree, "MSA-2[1].1.1");
  if (answers !== controlId) {
    return invalid(
      `MSA-2 is "${answers}", so it answers a different message — usually a late acknowledgment from an earlier timed-out send.`,
      controlId
    );
  }

  const code = read(tree, "MSA-1[1].1.1");
  if (isAckNakCode(code)) {
    return { exception: nakException(tree, code), type: "nak" };
  }
  if (!isAckSuccessCode(code)) {
    return invalid(
      code === ""
        ? "MSA-1 is empty, so accept or reject cannot be determined."
        : `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`,
      controlId
    );
  }

  return {
    response: {
      code,
      controlId: answers,
      // The acknowledgment's own MSH-10, not the one it answers. Reported for
      // tracing; correlation must never use it.
      id: read(tree, "MSH-10[1].1.1"),
      raw,
      text: read(tree, "MSA-3[1].1.1") || undefined,
      tree,
    },
    type: "accept",
  };
}

function invalid(reason: unknown, controlId: string): DecodeResponse {
  return {
    error: new MllpInvalidResponseError(reason, controlId),
    type: "invalid",
  };
}
