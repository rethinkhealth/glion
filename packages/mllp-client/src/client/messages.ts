/**
 * What the client makes of a message going out, and of an acknowledgment
 * coming back.
 *
 * Serializing a tree and reading an MSA are here; MLLP's block bytes come from
 * `@glion/mllp-codec`.
 *
 * Pure: nothing here knows the client has phases, or that a failure ends the
 * connection.
 *
 * @module
 */

import { isAckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-codec";
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

/**
 * The frame to write for `tree`, and the MSH-10 its acknowledgment must name.
 *
 * The bytes are the tree's canonical serialization, not an echo of whatever
 * the caller parsed.
 *
 * @throws {MllpInvalidMessageError} The message has no MSH-10, or it could not
 *   be serialized, encoded, or framed.
 */
export function encode(tree: Root): Uint8Array {
  const controlId = read(tree, "MSH-10[1].1.1");
  if (controlId === "") {
    throw new MllpInvalidMessageError(
      "the message has no MSH-10 control ID, so its acknowledgment could not be matched"
    );
  }
  try {
    // Framed here, not at the write: `frame` rejects a message containing a
    // reserved MLLP byte, and that is a fact about the message. It has to
    // surface before the client commits to sending, or a caller's bad message
    // becomes a dropped connection.
    return frame(encodeBytes(toHl7v2(tree)));
  } catch (error) {
    throw new MllpInvalidMessageError(error);
  }
}

/**
 * Reads one unframed message as the acknowledgment it carries.
 *
 * MSH-9 and the HL7 version are not checked (#668). `controlId` is MSA-2 as
 * found; correlating it against the message sent is the caller's.
 *
 * @param bytes One unframed message: the payload of a single MLLP frame.
 * @returns The acknowledgment, when MSA-1 accepted the message.
 * @throws {AckException} MSA-1 is `AE`, `AR`, `CE`, or `CR`.
 * @throws {MllpInvalidResponseError} The bytes are not readable as an
 *   acknowledgment: bad charset, unparseable HL7v2, or an MSA-1 that is absent
 *   or is not one of the six codes. The reason is on `cause`.
 */
export function decode(bytes: Uint8Array): MllpClientResponse {
  let raw: string;
  let tree: Root;
  try {
    raw = decodeBytes(bytes);
    tree = parseHL7v2(raw);
  } catch (error) {
    // Named here because this is the layer that knows a reply is being read.
    // Left raw, a caller has to treat every throw as the remote system's
    // fault, and closes a healthy connection when it was ours.
    throw new MllpInvalidResponseError(error);
  }

  // Asked before MSA-1 is judged here, because a refusal is the one answer
  // that leaves the connection in step. It reads MSA-1 for itself, and gives
  // nothing back for anything that is not a NAK.
  const nak = nakException(tree);
  if (nak !== undefined) {
    throw nak;
  }

  const code = read(tree, "MSA-1[1].1.1");
  if (!isAckSuccessCode(code)) {
    throw new MllpInvalidResponseError(
      code === ""
        ? "MSA-1 is empty, so accept or reject cannot be determined."
        : `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`
    );
  }

  return {
    code,
    // Reported, not required: an empty MSA-2 answers nothing, and only the
    // caller knows what it sent.
    controlId: read(tree, "MSA-2[1].1.1"),
    // The acknowledgment's own MSH-10, not the one it answers. Reported for
    // tracing; correlation must never use it.
    id: read(tree, "MSH-10[1].1.1"),
    raw,
    text: read(tree, "MSA-3[1].1.1") || undefined,
    tree,
  };
}
