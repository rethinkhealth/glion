/**
 * HL7v2 operations for the client. The AST (`Root`) is the first-class send
 * currency: every `send()` input is normalized to a tree and the wire bytes are
 * produced from that tree with `@glion/to-hl7v2`. The client is therefore an
 * *originating / cleaning* client — it emits canonical HL7v2, not a byte-exact
 * relay of whatever arrived. A `string` / `Uint8Array` is parsed first (it is a
 * serialized tree); a `Root` is used directly.
 *
 * **What "cleaning" changes** (syntactic only — semantics are preserved):
 * line endings are normalized to CR, and trailing empty fields / segments are
 * trimmed. Escape sequences (`\F\`, `\X0D\`, …), Z-segments, repetitions, and
 * components are preserved verbatim by the parser→serializer round trip.
 *
 * **Known limitations** (documented, accepted):
 *
 * - Trailing-empty-field trimming is NOT idempotent — it drops one trailing empty
 *   field per pass (`PID|1|||||` → `PID|1||||` → … → `PID|1`), so cleaning the
 *   same message twice can yield different bytes. Semantically faithful (the
 *   fields are absent either way); syntactically non-convergent.
 * - **Decode-implies-encode invariant:** the client parses with the base
 *   `@glion/parser`, which does NOT decode escape sequences — so `\F\` in →
 *   `\F\` out, no re-encode needed. Do NOT hand `send()` a `Root` that has
 *   already been escape-decoded (e.g. via `hl7v2DecodeEscapes`): `toHl7v2` has
 *   no re-encode step and would emit the decoded literal, corrupting field
 *   structure.
 * - Non-UTF-8 input bytes (Latin-1 / Windows-1252) cannot be decoded and are
 *   rejected. This inherits the glion ecosystem's UTF-8 assumption; whether
 *   that assumption is correct is tracked separately (see the encoding GH
 *   issue), not papered over here.
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
import { value } from "@glion/util-query";

import { MllpClientError, MllpErrorCode } from "./errors";

/**
 * Strict UTF-8 decoder — throws on invalid bytes. HL7v2 messages SHOULD
 * be ASCII / UTF-8 in 2.x and later. Latin-1 / Windows-1252 peers will
 * fail PARSE_FAILED rather than silently substitute U+FFFD.
 */
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

/**
 * What `MllpClient.send()` accepts. All inputs are normalized to a tree and
 * serialized to canonical HL7v2 for the wire (see the module JSDoc): a `string`
 * / `Uint8Array` is parsed first; a `Root` is used directly.
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

/** What a send needs on the wire, derived from a single parse of the input. */
export interface PreparedSend {
  /** Canonical HL7v2 wire bytes, MLLP-framed. */
  readonly framed: Uint8Array;
  /** MSH-10 of the (cleaned) message, for ACK correlation. `""` if absent. */
  readonly requestControlId: string;
}

/**
 * Normalize a send input to its canonical wire form and read its control ID —
 * from ONE parse. A `string` / `Uint8Array` is parsed to a tree (the bytes are
 * decoded as UTF-8 first); a `Root` is used directly. The tree is then
 * serialized with `@glion/to-hl7v2` and MLLP-framed, and MSH-10 is read from
 * the same tree. The wire bytes are therefore the *cleaned* canonical form, not
 * the caller's original bytes — see the module JSDoc.
 *
 * @throws {MllpClientError} `PARSE_FAILED` when a `Uint8Array` is not valid
 *   UTF-8 (e.g. a Latin-1 / Windows-1252 feed). The cause carries the decode
 *   error. This inherits the ecosystem's UTF-8 assumption.
 * @throws {FramingError} When the serialized message carries an embedded MLLP
 *   framing byte (VT or FS) that cannot be framed. CR is allowed — it is the
 *   HL7v2 segment terminator.
 */
export function prepareSend(input: SendInput): PreparedSend {
  const tree = toTree(input);
  return {
    framed: frame(toHl7v2(tree)),
    requestControlId: readValue(tree, "MSH-10[1].1.1") ?? "",
  };
}

function toTree(input: SendInput): Root {
  if (typeof input !== "string" && !(input instanceof Uint8Array)) {
    return input;
  }
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      text = TEXT_DECODER.decode(input);
    } catch (error) {
      throw new MllpClientError(
        MllpErrorCode.PARSE_FAILED,
        "The message bytes are not valid UTF-8 and cannot be parsed (HL7v2 in the glion ecosystem is UTF-8; a Latin-1 / Windows-1252 feed is not yet supported).",
        { cause: error }
      );
    }
  }
  // The parser is lenient — it never throws — so a tree is always produced,
  // even for non-HL7v2 text (MSH-10 then reads as "").
  return parseHL7v2(text);
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
    text = TEXT_DECODER.decode(raw);
  } catch (error) {
    // Strict UTF-8 decode (fatal): a Latin-1 / Windows-1252 peer must surface
    // as PARSE_FAILED, not a raw TypeError, so the contract "every failure is
    // an MllpClientError you can branch on by `code`" holds on the ACK path
    // just as the request side (readableTree) already guards it.
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "The peer's ACK is not valid UTF-8; HL7v2 messages must be ASCII/UTF-8 (a Latin-1 / Windows-1252 peer trips this). See the error's cause.",
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
