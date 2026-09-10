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

import { isAckCode, isAckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes, encodeBytes } from "@glion/util-charset";

import {
  MllpInvalidMessageError,
  MllpInvalidResponseError,
  nakException,
} from "../errors";
import type { Acknowledgment, MllpClientResponse } from "../types";
import { read } from "../utils";

/**
 * `tree` as the bytes to send, in canonical HL7v2 rather than an echo of
 * whatever the caller parsed. Framing belongs to the connection.
 *
 * @throws {MllpInvalidMessageError} The message has no MSH-10, or it could not
 *   be serialized or encoded.
 */
export function encode(tree: Root): Uint8Array {
  const controlId = read(tree, "MSH-10[1].1.1");
  if (controlId === "") {
    throw new MllpInvalidMessageError(
      "the message has no MSH-10 control ID, so its acknowledgment could not be matched"
    );
  }
  try {
    return encodeBytes(toHl7v2(tree));
  } catch (error) {
    throw new MllpInvalidMessageError(error);
  }
}

/**
 * Reads one message as the acknowledgment it carries.
 *
 * MSA-1 is read, not judged, and MSA-2 is not correlated — see
 * {@link responseTo}. MSH-9 and the HL7 version are not checked (#668).
 *
 * @param bytes One message, as it came off the connection.
 * @throws {MllpInvalidResponseError} The bytes are not readable as an
 *   acknowledgment: bad charset, unparseable HL7v2, or an MSA-1 that is absent
 *   or is not one of the six codes. The reason is on `cause`.
 */
export function decode(bytes: Uint8Array): Acknowledgment {
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

  const code = read(tree, "MSA-1[1].1.1");
  if (!isAckCode(code)) {
    throw new MllpInvalidResponseError(
      code === ""
        ? "MSA-1 is empty, so accept or reject cannot be determined."
        : `MSA-1 is "${code}", which is not one of AA, AE, AR, CA, CE, or CR.`
    );
  }

  return {
    code,
    controlId: read(tree, "MSA-2[1].1.1"),
    id: read(tree, "MSH-10[1].1.1"),
    raw,
    text: read(tree, "MSA-3[1].1.1") || undefined,
    tree,
  };
}

/**
 * `ack` as the answer to the message `controlId` identifies.
 *
 * Correlation is checked before MSA-1 is read, so a verdict is only ever
 * reported for the message it was given about.
 *
 * @throws {MllpInvalidResponseError} MSA-2 names another message.
 * @throws {AckException} MSA-1 is `AE`, `AR`, `CE`, or `CR`.
 */
export function responseTo(
  ack: Acknowledgment,
  controlId: string
): MllpClientResponse {
  if (ack.controlId !== controlId) {
    throw new MllpInvalidResponseError(
      `MSA-2 is "${ack.controlId}", so it answers a different message — usually a late acknowledgment from an earlier timed-out send.`,
      controlId
    );
  }

  const { code } = ack;
  if (!isAckSuccessCode(code)) {
    throw nakException(ack.tree, code);
  }
  return { ...ack, code };
}
