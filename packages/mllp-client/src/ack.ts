/**
 * Inbound ACK codec for the client — turns the peer's de-framed ACK bytes into
 * a structured response, or throws.
 *
 * The ACK is decoded as strict UTF-8 via `@glion/util-charset` (a non-UTF-8
 * peer is rejected with `INVALID_RESPONSE` rather than silently substituted),
 * parsed, and correlated against the request's MSH-10. Accept codes (`AA`/`CA`)
 * resolve; a NAK (`AE`/`AR`/`CE`/`CR`) throws the matching `@glion/ack`
 * `AckException`. Every other way the reply can be unusable — undecodable
 * bytes, no / a non-standard MSA-1, or a control id that doesn't match the
 * request — is one `INVALID_RESPONSE` error, distinguished by its `message`.
 *
 * **Limitation — no conformance validation.** This codec reads MSA-1 / MSA-2 /
 * ERR-3 / ERR-4 and trusts them; it does NOT validate that the response is a
 * conformant HL7v2 acknowledgment. It never checks MSH-9 (so a non-ACK message
 * carrying an `MSA` segment is accepted), does not require a well-formed MSH
 * header, ignores HL7 version, and silently uses the first `MSA` when a peer
 * sends conflicting ones. Any structural/profile validation is the caller's to
 * add. The permissive behaviour is pinned in `test/ack.test.ts`.
 *
 * @module
 */

import { ackExceptionFor, isAckCode, isAckNakCode } from "@glion/ack";
import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { decodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import { MllpClientError, MllpErrorCode } from "./errors";

/**
 * The codec's result of parsing an ACK — the message-level fields. Wire timing
 * (`timestamp`, `durationMs`) is NOT here: the connection measures the exchange
 * and adds it (see {@link MllpClientResponse}).
 */
interface ParsedAck {
  /**
   * MSA-1 — always an accept ({@link AckSuccessCode}). A NAK (AE/AR/CE/CR)
   * throws the matching `@glion/ack` `AckException` instead of returning.
   */
  readonly code: AckSuccessCode;
  /**
   * MSA-2 — the control ID echoed by the peer. Empty if the peer omitted it
   * (some early-HL7 peers don't).
   */
  readonly controlId: string;
  /** Parsed AST of the ACK message. */
  readonly tree: Root;
  /** De-framed ACK payload as decoded text (UTF-8). */
  readonly raw: string;
}

/**
 * A {@link ParsedAck} plus the wire timing the connection measured for the
 * exchange.
 */
export interface MllpClientResponse extends ParsedAck {
  /** Wall-clock instant the ACK frame finished arriving. */
  readonly timestamp: Date;
  /** Wire-level round-trip duration (monotonic), milliseconds. */
  readonly durationMs: number;
}

/**
 * Parse and correlate the peer's ACK. Decodes `rawAck` as strict UTF-8, parses
 * it, checks MSA-1, and correlates the response's MSA-2 against
 * `expectedControlId` (the MSH-10 of the message we sent). An accept (AA/CA)
 * returns a {@link ParsedAck}; a NAK throws the matching `@glion/ack`
 * `AckException`. The wire timing is the caller's to attach.
 *
 * @throws {MllpClientError} `INVALID_RESPONSE` when the reply is unusable —
 *   undecodable bytes (charset error on `cause`), no MSA-1, a non-standard
 *   MSA-1, or an MSA-2 that doesn't match `expectedControlId`. The `message`
 *   says which.
 * @throws {AckException} (from `@glion/ack`) when MSA-1 is a NAK (AE/AR/CE/CR).
 */
export function parseResponse(
  rawAck: Uint8Array,
  expectedControlId: string
): ParsedAck {
  let text: string;
  try {
    text = decodeBytes(rawAck);
  } catch (error) {
    // decodeBytes (strict UTF-8) rejected the bytes; surface INVALID_RESPONSE,
    // not the raw CharsetError, so "every failure is an MllpClientError you can
    // branch on by code" holds on the ACK path. The CharsetError stays on
    // `cause` for diagnostics — consumers never import @glion/util-charset.
    throw new MllpClientError(
      MllpErrorCode.INVALID_RESPONSE,
      "Could not decode the peer's ACK bytes as UTF-8 (see the error's cause).",
      { cause: error }
    );
  }

  // The parser is lenient — it never throws on message text — so a tree is
  // always produced; a malformed ACK falls through to the no-MSA-1 check below.
  const tree = parseHL7v2(text);

  const codeRaw = readValue(tree, "MSA-1[1].1.1");
  if (codeRaw === null || codeRaw === "") {
    throw new MllpClientError(
      MllpErrorCode.INVALID_RESPONSE,
      "The peer's ACK has no MSA-1 acknowledgment code, so accept/reject cannot be determined."
    );
  }
  if (!isAckCode(codeRaw)) {
    throw new MllpClientError(
      MllpErrorCode.INVALID_RESPONSE,
      `Unknown acknowledgment code "${codeRaw}"; expected AA / AE / AR / CA / CE / CR`
    );
  }

  const controlId = readValue(tree, "MSA-2[1].1.1") ?? "";

  // Correlation: only reject if both sides have non-empty IDs and they disagree.
  // An empty response-side controlId is real-world compat (some older peers
  // don't echo MSA-2).
  if (
    expectedControlId !== "" &&
    controlId !== "" &&
    expectedControlId !== controlId
  ) {
    throw new MllpClientError(
      MllpErrorCode.INVALID_RESPONSE,
      `ACK control-ID mismatch: the response's MSA-2 ("${controlId}") does not match the request's MSH-10 ("${expectedControlId}"). This usually means a late ACK from a previously-timed-out request arrived on this connection.`
    );
  }

  if (isAckNakCode(codeRaw)) {
    // A NAK is an ACK-level rejection — @glion/ack owns both the partition
    // (isAckNakCode) and the code→exception mapping (ackExceptionFor); the
    // client just supplies the fields it read off the ACK. ERR-3 / ERR-4 come
    // straight from the peer and may be absent or non-standard, so they pass
    // through verbatim.
    throw ackExceptionFor(codeRaw, {
      controlId,
      errorCode: readValue(tree, "ERR-3[1].1.1") ?? undefined,
      raw: text,
      severity: readValue(tree, "ERR-4[1].1.1") ?? undefined,
      tree,
    });
  }

  return { code: codeRaw, controlId, raw: text, tree };
}

function readValue(tree: Root, path: string): string | null {
  return value(tree, path)?.value ?? null;
}
