/**
 * Encoding: one HL7v2 tree to one MLLP frame, and the MSH-10 that names it.
 *
 * Serializes the tree to canonical HL7v2, encodes it as UTF-8, and frames it.
 * The bytes are the tree's serialization, not an echo of the caller's input.
 * Text is parsed by the caller; this module accepts trees only.
 *
 * Framing happens here rather than at the write: `frame` rejects a message
 * containing a reserved MLLP byte, which is a property of the message.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-codec";
import { toHl7v2 } from "@glion/to-hl7v2";
import { encodeBytes } from "@glion/util-charset";

/**
 * Encodes one message as a single MLLP frame.
 *
 * @param tree The message to encode.
 * @returns The frame: the message serialized, encoded as UTF-8, and wrapped.
 * @throws The serializer's, the charset's, and the framing errors, unwrapped.
 */
export function encode(tree: Root): Uint8Array {
  const text = toHl7v2(tree);
  const bytes = encodeBytes(text);
  // Framed here, not at the write. `frame` rejects a message containing a
  // reserved MLLP byte, and that is a fact about the message, not about the
  // connection: it has to surface as INVALID_MESSAGE / `not-sent` before the
  // client commits to sending. Moving this into the write turns a caller's
  // bad message into a dropped connection.
  return frame(bytes);
}
