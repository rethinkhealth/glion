/**
 * HL7v2 message codec for the client — the translation between an HL7v2 message
 * and the MLLP wire, in both directions.
 *
 * **Outbound** ({@link toTree}, {@link toWireBytes}, {@link requestControlId}):
 * the AST (`Root`) is the first-class send currency. Every `send()` input is
 * normalized to a tree and the wire bytes are produced from that tree with
 * `@glion/to-hl7v2`. The client is therefore an *originating / cleaning* client
 * — it emits canonical HL7v2, not a byte-exact relay. A `string` is parsed (it
 * is a serialized tree); a `Root` is used directly. Raw bytes are NOT accepted:
 * a caller holding wire bytes decodes them to text at its own I/O boundary
 * (where charset / MSH-18 knowledge lives) and passes the `string`.
 *
 * What "cleaning" changes (syntactic only — semantics are preserved): line
 * endings normalize to CR and trailing empty fields / segments are trimmed.
 * Escape sequences (`\F\`, `\X0D\`, …), Z-segments, repetitions, and components
 * round-trip verbatim. Two accepted limitations: trailing-empty trimming is not
 * idempotent (it drops one trailing empty field per pass); and a `Root` that
 * was escape-_decoded_ upstream (e.g. via `hl7v2DecodeEscapes`) must NOT be
 * sent — `toHl7v2` has no re-encode step and would emit the decoded literal.
 *
 * **Inbound** ({@link parseResponse}, {@link MllpClientResponse}): the peer's
 * de-framed ACK bytes become a structured response, or throw. The ACK is
 * decoded as strict UTF-8 (a non-UTF-8 peer is rejected with `PARSE_FAILED`
 * rather than silently substituted — this inherits the glion ecosystem's UTF-8
 * assumption, tracked separately), parsed, and correlated against the request's
 * MSH-10. Accept codes (`AA`/`CA`) resolve; a NAK (`AE`/`AR`/`CE`/`CR`) throws
 * the matching `@glion/ack` `AckException`.
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
 * Strict UTF-8 decoder — throws on invalid bytes. HL7v2 messages SHOULD be
 * ASCII / UTF-8 in 2.x and later. Latin-1 / Windows-1252 peers fail
 * `PARSE_FAILED` rather than silently substitute U+FFFD.
 */
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

// ── Outbound ───────────────────────────────────────────────────────────────

/**
 * What `MllpClient.send()` accepts — a `string` (serialized HL7v2 text) or a
 * `Root` (a parsed tree). Both are normalized to a tree and serialized to
 * canonical HL7v2 for the wire (see the module JSDoc). Raw bytes are NOT
 * accepted — decode them to text at your I/O boundary and pass the `string`.
 */
export type SendInput = string | Root;

/**
 * Parse a send input into a tree at the client boundary. A `string` is parsed
 * (it is serialized HL7v2 text); a `Root` is returned as-is. This is the ONLY
 * place a `string` enters the client — everything past the boundary works on a
 * `Root`.
 */
export function toTree(input: SendInput): Root {
  if (typeof input !== "string") {
    return input;
  }
  // The parser is lenient — it never throws — so a tree is always produced,
  // even for non-HL7v2 text (MSH-10 then reads as "").
  return parseHL7v2(input);
}

/**
 * Serialize a parsed message to its canonical MLLP wire bytes. The bytes are
 * the _cleaned_ canonical form, not a byte-exact echo of any prior wire form.
 *
 * @throws {FramingError} When the serialized message carries an embedded MLLP
 *   framing byte (VT or FS) that cannot be framed. CR is allowed — it is the
 *   HL7v2 segment terminator.
 */
export function toWireBytes(tree: Root): Uint8Array {
  return frame(toHl7v2(tree));
}

/**
 * The request's HL7v2 control ID (MSH-10), used to correlate the eventual ACK
 * (matched against the response's MSA-2). `""` when absent.
 */
export function requestControlId(tree: Root): string {
  return readValue(tree, "MSH-10[1].1.1") ?? "";
}

// ── Inbound ──────────────────────────────────────────────────────────────────

export interface MllpClientResponse {
  /**
   * MSA-1 — always an accept ({@link AckSuccessCode}). A NAK (AE/AR/CE/CR)
   * throws the matching `@glion/ack` `AckException` instead of resolving.
   */
  readonly code: AckSuccessCode;
  /**
   * MSA-2 — correlation ID echoed by the peer. Empty if the peer omitted it
   * (some early-HL7 peers don't).
   */
  readonly controlId: string;
  /** MSH-10 of the request that this ACK responds to. */
  readonly requestControlId: string;
  /** Parsed AST of the ACK message. */
  readonly tree: Root;
  /** De-framed ACK payload as decoded text (UTF-8). */
  readonly raw: string;
  /** Wall-clock instant the ACK frame finished arriving. */
  readonly timestamp: Date;
  /** Wire-level round-trip duration (monotonic), milliseconds. */
  readonly durationMs: number;
}

interface ParseInput {
  readonly raw: Uint8Array;
  readonly timestamp: Date;
  readonly durationMs: number;
  readonly requestControlId: string;
}

export function parseResponse(input: ParseInput): MllpClientResponse {
  const { raw, timestamp, durationMs, requestControlId: reqControlId } = input;

  let text: string;
  try {
    text = TEXT_DECODER.decode(raw);
  } catch (error) {
    // Strict UTF-8 decode (fatal): a Latin-1 / Windows-1252 peer must surface as
    // PARSE_FAILED, not a raw TypeError, so the contract "every failure is an
    // MllpClientError you can branch on by `code`" holds on the ACK path.
    throw new MllpClientError(
      MllpErrorCode.PARSE_FAILED,
      "The peer's ACK is not valid UTF-8; HL7v2 messages must be ASCII/UTF-8 (a Latin-1 / Windows-1252 peer trips this). See the error's cause.",
      { cause: error }
    );
  }

  // The parser is lenient — it never throws on message text — so a tree is
  // always produced; a malformed ACK falls through to the no-MSA-1 check below.
  const tree = parseHL7v2(text);

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

  // Correlation: only reject if both sides have non-empty IDs and they disagree.
  // An empty response-side controlId is real-world compat (some older peers
  // don't echo MSA-2).
  if (reqControlId !== "" && controlId !== "" && reqControlId !== controlId) {
    throw new MllpClientError(
      MllpErrorCode.CORRELATION_MISMATCH,
      `ACK control-ID mismatch: the response's MSA-2 ("${controlId}") does not match the request's MSH-10 ("${reqControlId}"). This usually means a late ACK from a previously-timed-out request arrived on this connection.`,
      { actual: controlId, expected: reqControlId, raw: text, tree }
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
    raw: text,
    requestControlId: reqControlId,
    timestamp,
    tree,
  };
}

function readValue(tree: Root, path: string): string | null {
  return value(tree, path)?.value ?? null;
}
