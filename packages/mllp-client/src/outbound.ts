/**
 * The outbound boundary: turn one `SendInput` into the bytes that go on the
 * wire plus the correlation ID the exchange needs — the outbound twin of
 * `./ack` (which reads the reply). Each stage is owned by its ecosystem
 * package; nothing is hand-rolled here:
 *
 * 1. **Parse** — a `string` becomes a tree via the injected parse function (the
 *    client passes `parseHL7v2`; the parameter is a unit-test seam, not a
 *    public option — re-examined in issue #685); a `Root` is used as-is. The
 *    tree is the wire currency: this is an originating / cleaning client, not a
 *    byte-exact relay.
 * 2. **Correlate** (`@glion/util-query`) — MSH-10 is read off the tree; a missing
 *    control ID throws `INVALID_MESSAGE`, because without it the acknowledgment
 *    could never be matched to this message.
 * 3. **Serialize** (`@glion/to-hl7v2`) — the tree re-serializes to canonical HL7v2
 *    text (CR line endings, trailing empties trimmed).
 * 4. **Encode** (`@glion/util-charset`) — text becomes UTF-8 wire bytes; charset
 *    knowledge lives there, never here.
 * 5. **Frame** (`@glion/mllp-codec`) — the bytes get the MLLP envelope; a reserved
 *    character (VT/FS) throws `INVALID_MESSAGE` with the `MllpCodecError` on
 *    `cause`.
 *
 * `prepareOutbound` never touches the socket: it either returns a complete,
 * sendable message or throws with nothing written.
 *
 * @module
 */

import type { Root } from "@glion/ast";
import { frame, MllpCodecError } from "@glion/mllp-codec";
import { toHl7v2 } from "@glion/to-hl7v2";
import { encodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import type { SendInput } from "./client";
import { MllpClientError } from "./errors";

/** What `prepareOutbound` hands the exchange: wire bytes + correlation ID. */
export interface OutboundMessage {
  /** The complete MLLP frame, ready for a single socket write. */
  readonly framed: Uint8Array;
  /** MSH-10 — what the remote system's MSA-2 must echo. */
  readonly requestControlId: string;
}

/**
 * Run the outbound stages over one message.
 *
 * @throws {MllpClientError} `INVALID_MESSAGE` when the message has no MSH-10,
 *   or when the serialized message carries a reserved VT or FS byte (the
 *   `MllpCodecError` is on `cause`).
 */
export function prepareOutbound(
  message: SendInput,
  parser: (input: string) => Root
): OutboundMessage {
  // FIXME(https://github.com/rethinkhealth/glion/issues/685): parseHL7v2 is
  // baked in by the caller — the parser should be injectable by the
  // application, not enforced by the client.
  const tree = typeof message === "string" ? parser(message) : message;

  // Correlate before the serialize/encode/frame passes: a message that can
  // never be acknowledged is rejected on a single tree lookup, and a missing
  // control ID is never masked by a later framing error.
  const requestControlId = value(tree, "MSH-10[1].1.1")?.value;
  if (!requestControlId) {
    throw MllpClientError.missingControlId();
  }

  try {
    return { framed: frame(encodeBytes(toHl7v2(tree))), requestControlId };
  } catch (error) {
    if (error instanceof MllpCodecError) {
      // A reserved VT/FS byte in the serialized text. Wrapped so every error
      // the client raises is an MllpClientError the caller branches on by
      // code; the codec error stays on `cause`.
      throw MllpClientError.reservedCharacter(error);
    }
    throw error;
  }
}
