/**
 * What the codec reads and writes. Types only — no runtime values.
 *
 * Shared by `encode` and `decode` so the two halves of the codec describe the
 * same things: one message going out, one acknowledgment coming back.
 *
 * @module
 */

import type { AckNakCode, AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";

/** What every acknowledgment carries, whatever MSA-1 says. */
interface AcknowledgmentFields {
  /**
   * MSH-10 of the acknowledgment itself: the receiver's own identifier for
   * this reply, which it will have logged under. Useful for tracing a message
   * across both systems; never useful for correlation — see `controlId`.
   */
  readonly id: string;
  /**
   * MSA-2, which HL7v2 also calls the Message Control ID: the MSH-10 of the
   * message this one answers.
   *
   * The standard gives MSH-10 and MSA-2 the same field name, and that is not
   * an accident — MSA-2 *contains* the other message's MSH-10. Which is why
   * `id` and this are both control IDs and mean opposite things: `id` is who
   * this acknowledgment is, `controlId` is who it is about. MSA-2 is the only
   * back-reference HL7v2 provides, and so the only thing correlation can use.
   */
  readonly controlId: string;
  /** The acknowledgment, parsed. */
  readonly tree: Root;
  /** The acknowledgment as received, decoded to text. */
  readonly raw: string;
  /** MSA-3: the remote system's own diagnostic, when it gave one. */
  readonly text?: string;
}

/** The remote system accepted the message: MSA-1 is `AA` or `CA`. */
export interface Ack extends AcknowledgmentFields {
  /** MSA-1: `AA` or `CA`. */
  readonly code: AckSuccessCode;
}

/**
 * The remote system did not accept the message: MSA-1 is `AE`, `AR`, `CE`, or
 * `CR`. Only a NAK carries the ERR fields — an accept has nothing to report
 * them about.
 */
export interface AckNak extends AcknowledgmentFields {
  /** MSA-1: `AE`, `AR`, `CE`, or `CR`. */
  readonly code: AckNakCode;
  /** MSA-3, or ERR-8 when MSA-3 is absent. */
  readonly text?: string;
  /** ERR-3: the HL7 error condition. */
  readonly errorCode?: string;
  /** ERR-4: the severity. */
  readonly severity?: string;
}

/**
 * One acknowledgment, as found. Whether a NAK is an *error*, and whether it
 * answers the right message, are judgements for the caller — this reports what
 * the remote system said, not what to do about it.
 */
export type Acknowledgment = AckNak | Ack;
