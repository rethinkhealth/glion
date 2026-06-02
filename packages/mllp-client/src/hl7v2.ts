/**
 * HL7v2 operations for the client. The split here is deliberate and follows
 * the AST's nature: an AST is an *abstract* tree, not a concrete byte-exact one
 * (a trailing field delimiter, line-ending style, etc. are syntactic details it
 * legitimately drops). So the client uses the tree for what trees are for —
 * *reading* meaning (MSH-10 correlation, the parsed ACK) — and uses the
 * caller's own bytes for the *wire*, never round-tripping them through the
 * parser. A `Root` input has no original bytes, so it (and only it) is
 * serialized with `@glion/to-hl7v2`.
 *
 * @module
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  isAckCode,
} from "@glion/ack";
import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { frame } from "@glion/mllp-transport";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

import { MllpClientError, MllpErrorCode } from "./errors";

/**
 * What `MllpClient.send()` accepts. `string` / `Uint8Array` are transmitted
 * verbatim and read (best-effort) for the control ID; a `Root` is serialized
 * for the wire and read directly.
 */
export type SendInput = string | Uint8Array | Root;

export interface MllpClientResponse {
  /**
   * MSA-1 — always an accept ({@link AckSuccessCode}). A NAK (AE/AR/CE/CR)
   * throws the matching `@glion/ack` `AckException` instead of resolving.
   */
  readonly code: AckSuccessCode;
  /**
   * MSA-2 — correlation ID echoed by the peer. Empty if the peer
   * omitted it (some early-HL7 peers don't).
   */
  readonly controlId: string;
  /** MSH-10 of the request that this ACK responds to. */
  readonly requestControlId: string;
  /** Parsed AST of the ACK message. */
  readonly tree: Root;
  /** De-framed payload bytes. */
  readonly raw: Uint8Array;
  /** Wall-clock instant the ACK frame finished arriving. */
  readonly timestamp: Date;
  /** Wire-level round-trip duration (monotonic), milliseconds. */
  readonly durationMs: number;
}

/**
 * Build the MLLP-framed wire bytes for a send. `string` / `Uint8Array` are
 * framed verbatim — the caller's exact bytes reach the wire, with no lossy
 * parse→serialize round trip. A `Root` has no original bytes, so it is
 * serialized with `@glion/to-hl7v2`.
 *
 * @throws {FramingError} When the message carries an embedded MLLP framing
 *   byte (VT or FS) that cannot be framed. CR is allowed — it is the HL7v2
 *   segment terminator.
 */
export function toWireFrame(input: SendInput): Uint8Array {
  if (typeof input === "string" || input instanceof Uint8Array) {
    return frame(input);
  }
  return frame(toHl7v2(input));
}

/**
 * Read MSH-10 (the message control ID) for correlation. A `Root` is read
 * directly; `string` / `Uint8Array` is parsed with `@glion/parser`. This is
 * best-effort: reading is for correlation only and never blocks the send, so
 * unparseable or undecodable input simply yields `""` (correlation skipped).
 */
export function readRequestControlId(input: SendInput): string {
  const tree = readableTree(input);
  return tree ? (readValue(tree, "MSH-10[1].1.1") ?? "") : "";
}

function readableTree(input: SendInput): Root | null {
  if (typeof input !== "string" && !(input instanceof Uint8Array)) {
    return input;
  }
  let text: string;
  try {
    text = typeof input === "string" ? input : decodeBytes(input);
  } catch {
    // Undecodable bytes: the wire still gets them verbatim, but we can't read
    // MSH-10, so correlation is skipped.
    return null;
  }
  try {
    return parseHL7v2(text);
  } catch {
    // Not parseable HL7v2: framable but not structured. Sent verbatim;
    // correlation skipped.
    return null;
  }
}

interface ParseInput {
  readonly raw: Uint8Array;
  readonly timestamp: Date;
  readonly durationMs: number;
  readonly requestControlId: string;
}

export function parseResponse(input: ParseInput): MllpClientResponse {
  const { raw, timestamp, durationMs, requestControlId } = input;

  let text: string;
  try {
    text = decodeBytes(raw);
  } catch (error) {
    // A non-UTF-8 ACK (e.g. a Latin-1 / Windows-1252 peer) is a parse failure:
    // it must surface as MllpClientError(PARSE_FAILED), not a raw TypeError, so
    // the contract "every failure is an MllpClientError you can branch on by
    // `code`" holds on the ACK path too. The specific reason — decodeBytes'
    // `IncompatibleCharsetError` — rides on `cause`.
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "The peer's ACK is not valid UTF-8; only UTF-8 is supported. See the error's cause.",
      { cause: error }
    );
  }

  let tree: Root;
  try {
    tree = parseHL7v2(text);
  } catch (error) {
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "Could not parse the peer's ACK as an HL7v2 message (see the error's cause).",
      { cause: error }
    );
  }

  const codeRaw = readValue(tree, "MSA-1[1].1.1");
  if (codeRaw === null || codeRaw === "") {
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "The peer's ACK has no MSA-1 acknowledgment code, so accept/reject cannot be determined."
    );
  }
  if (!isAckCode(codeRaw)) {
    throw new MllpClientError(
      MllpErrorCode.UNKNOWN_ACK_CODE,
      `Unknown acknowledgment code "${codeRaw}"; expected AA / AE / AR / CA / CE / CR`
    );
  }

  const controlId = readValue(tree, "MSA-2[1].1.1") ?? "";

  // Correlation: only reject if both sides have non-empty IDs and they
  // disagree. Empty response-side controlId is real-world compat (some
  // older peers don't echo MSA-2).
  if (
    requestControlId !== "" &&
    controlId !== "" &&
    requestControlId !== controlId
  ) {
    throw new MllpClientError(
      MllpErrorCode.CORRELATION_MISMATCH,
      `ACK control-ID mismatch: the response's MSA-2 ("${controlId}") does not match the request's MSH-10 ("${requestControlId}"). This usually means a late ACK from a previously-timed-out request arrived on this connection.`,
      { actual: controlId, expected: requestControlId, raw, tree }
    );
  }

  if (
    codeRaw === "AE" ||
    codeRaw === "AR" ||
    codeRaw === "CE" ||
    codeRaw === "CR"
  ) {
    // A NAK is an ACK-level rejection — the same domain @glion/ack models for
    // the server side — so the client throws that package's typed exceptions
    // (caught via `instanceof AckException`) rather than a parallel hierarchy.
    // ERR-3 / ERR-4 come straight from the peer and may be absent or
    // non-standard, so they pass through verbatim.
    const message = `Peer rejected message with acknowledgment code ${codeRaw}`;
    const options = {
      controlId,
      errorCode: readValue(tree, "ERR-3[1].1.1") ?? undefined,
      raw: text,
      severity: readValue(tree, "ERR-4[1].1.1") ?? undefined,
      tree,
    };
    switch (codeRaw) {
      case "AE": {
        throw new AckApplicationError(message, options);
      }
      case "AR": {
        throw new AckApplicationReject(message, options);
      }
      case "CE": {
        throw new AckCommitError(message, options);
      }
      default: {
        throw new AckCommitReject(message, options);
      }
    }
  }

  return {
    code: codeRaw,
    controlId,
    durationMs,
    raw,
    requestControlId,
    timestamp,
    tree,
  };
}

function readValue(tree: Root, path: string): string | null {
  const result = value(tree, path);
  if (result === null) {
    return null;
  }
  return result.value;
}
