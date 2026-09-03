/**
 * `glion send` — pure renderers for the exchange result.
 *
 * Two output modes, both driven by a single plain {@link SendOutcome} object:
 *
 * - {@link renderHuman} — the TTY "Exchange view" (the `-> sent` / `<- ACK|NAK`
 *   lines). Multi-line, human-readable; goes to stderr in the handler.
 * - {@link renderJson} — exactly one JSON line with a stable key set; goes to
 *   stdout in the handler.
 *
 * The renderers do no IO and never touch the MLLP client, the ack exceptions,
 * or the parser. The handler maps the wire types (`MllpClientResponse`,
 * `@glion/ack` `AckException`, `MllpClientError`) and any pre-send usage error
 * into a {@link SendOutcome} and then calls these. Keeping the renderers
 * decoupled from the wire types is what makes them exhaustively unit-testable
 * without sockets or fixtures.
 */

import type { AckNakCode } from "@glion/ack";

/**
 * The target the message was (or would have been) sent to. Carried on every
 * outcome so both renderers can report where the exchange happened.
 */
export interface SendTarget {
  host: string;
  port: number;
}

/**
 * What we know about the request we put on the wire. Populated for the
 * accept/NAK/transport branches (the message was serialized and a connection
 * was attempted); omitted for the `invalid` branch, which fails before any of
 * this exists.
 */
export interface SendRequestSummary {
  /** MSH-10 of the request — the control id the peer echoes in MSA-2. */
  controlId: string;
  /** Number of segments in the serialized message. */
  segmentCount: number;
  /** Byte length of the canonical (CR-delimited) wire form. */
  byteCount: number;
}

/** Peer accept: an `AA`/`CA` acknowledgment. Exit 0. */
export interface SendAcceptOutcome {
  kind: "accept";
  target: SendTarget;
  request: SendRequestSummary;
  /** Acknowledgment code: `AA` (application accept) or `CA` (commit accept). */
  code: "AA" | "CA";
  /** MSA-2 of the ACK — echoes the request control id when the peer complies. */
  ackControlId: string;
  /** MSA-3 free text, when the peer included one. */
  text?: string;
  /** Round-trip duration in milliseconds. */
  durationMs: number;
}

/** Peer NAK: an `AE`/`AR`/`CE`/`CR` rejection. Exit 1. */
export interface SendNakOutcome {
  kind: "nak";
  target: SendTarget;
  request: SendRequestSummary;
  /** Rejection code: `AE`/`AR` (application) or `CE`/`CR` (commit). */
  code: AckNakCode;
  ackControlId: string;
  /** MSA-3 free text (the peer's reason), when present. */
  text?: string;
  /** ERR-3 code (HL7 error condition), when the peer included an ERR segment. */
  errorCode?: string;
  /** ERR-4 severity, when present. */
  severity?: string;
  durationMs: number;
}

/**
 * Any failure the MLLP client raised, carried with its `MllpErrorCode`: the
 * message could not be prepared, the connection failed or timed out, the send
 * timed out, the reply was unusable, the connection dropped. Exit 2.
 */
export interface SendTransportOutcome {
  kind: "transport";
  target: SendTarget;
  /** May be absent if we failed before serializing the request. */
  request?: SendRequestSummary;
  /** The `MllpErrorCode` value, e.g. `SEND_TIMEOUT`, `CONNECT_FAILED`. */
  code: string;
  message: string;
}

/**
 * Failure before a client exists: the target could not be resolved or the
 * message could not be read. Exit 2. No request and no error code exist yet.
 */
export interface SendInvalidOutcome {
  kind: "invalid";
  /**
   * Present once a target is known; absent for usage/target-resolution
   * failures.
   */
  target?: SendTarget;
  message: string;
}

/** The plain object both renderers consume. */
export type SendOutcome =
  | SendAcceptOutcome
  | SendNakOutcome
  | SendTransportOutcome
  | SendInvalidOutcome;

// ── Duration formatting ──────────────────────────────────────────────
//
// Same scheme as src/tui/log-pane.tsx `fmtMs`: shrinking decimal precision as
// the magnitude grows, switching to seconds past 1000ms. Duplicated rather than
// shared — log-pane is React/Ink and this module is plain text; a shared helper
// would couple a CLI renderer to the TUI for three lines.
const MS_SUB_10 = 10;
const MS_SUB_100 = 100;
const MS_SUB_1000 = 1000;

function fmtMs(ms: number): string {
  if (ms < MS_SUB_10) {
    return `${ms.toFixed(3)}ms`;
  }
  if (ms < MS_SUB_100) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < MS_SUB_1000) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${(ms / MS_SUB_1000).toFixed(1)}s`;
}

// ── Human "Exchange view" ────────────────────────────────────────────

/**
 * Renders the multi-line "Exchange view" for a TTY. The caller writes the
 * returned string (no trailing newline) to stderr.
 *
 * Accept:
 * -> sent  127.0.0.1:2575  MSH-10 MSG00001  3 segs, 410 B
 * <- ACK   AA  MSA-2 MSG00001  12ms
 * "Message accepted"
 *
 * NAK:
 * -> sent  127.0.0.1:2575  MSH-10 MSG00001  3 segs, 410 B
 * <- NAK   AE  MSA-2 MSG00001  9ms
 * ERR-3 207  ERR-4 E  "unknown segment ZZZ"
 *
 * Transport / invalid collapse to a single diagnostic line — there is no
 * round-trip to lay out.
 */
export function renderHuman(outcome: SendOutcome): string {
  if (outcome.kind === "invalid") {
    return `x  ${outcome.message}`;
  }
  if (outcome.kind === "transport") {
    const where = `${outcome.target.host}:${outcome.target.port}`;
    return `x  ${where}  ${outcome.code}  ${outcome.message}`;
  }

  const sentLine = renderSentLine(outcome.target, outcome.request);

  if (outcome.kind === "accept") {
    const head = renderAckLine("ACK", outcome.code, outcome);
    const lines = [sentLine, head];
    if (outcome.text !== undefined && outcome.text.length > 0) {
      lines.push(`        ${quote(outcome.text)}`);
    }
    return lines.join("\n");
  }

  const head = renderAckLine("NAK", outcome.code, outcome);
  const lines = [sentLine, head];
  const detail = renderNakDetail(outcome);
  if (detail.length > 0) {
    lines.push(`        ${detail}`);
  }
  return lines.join("\n");
}

/** The `<- ACK|NAK CODE MSA-2 <id> <duration>` reply line. */
function renderAckLine(
  label: "ACK" | "NAK",
  code: string,
  outcome: { ackControlId: string; durationMs: number }
): string {
  return `<- ${label}   ${code}  MSA-2 ${outcome.ackControlId}  ${fmtMs(
    outcome.durationMs
  )}`;
}

function renderSentLine(
  target: SendTarget,
  request: SendRequestSummary
): string {
  const where = `${target.host}:${target.port}`;
  const segs = `${request.segmentCount} ${
    request.segmentCount === 1 ? "seg" : "segs"
  }`;
  return `-> sent  ${where}  MSH-10 ${request.controlId}  ${segs}, ${request.byteCount} B`;
}

function renderNakDetail(outcome: SendNakOutcome): string {
  const parts: string[] = [];
  if (outcome.errorCode !== undefined && outcome.errorCode.length > 0) {
    parts.push(`ERR-3 ${outcome.errorCode}`);
  }
  if (outcome.severity !== undefined && outcome.severity.length > 0) {
    parts.push(`ERR-4 ${outcome.severity}`);
  }
  if (outcome.text !== undefined && outcome.text.length > 0) {
    parts.push(quote(outcome.text));
  }
  return parts.join("  ");
}

function quote(text: string): string {
  return `"${text}"`;
}

// ── JSON line ────────────────────────────────────────────────────────

/**
 * Renders exactly one JSON line (no trailing newline) with a stable key set.
 * The caller writes it to stdout. Optional fields are omitted (not set to
 * `null`) when absent, so machine consumers can rely on `"key" in obj`.
 *
 * Success: {"ok":true,"code":"AA","controlId":"MSG1","requestControlId":"MSG1",
 * "durationMs":12,"host":"127.0.0.1","port":2575} Failure variants carry
 * `{"ok":false,"kind":"nak"|"transport"|"invalid", ...}`.
 */
export function renderJson(outcome: SendOutcome): string {
  return JSON.stringify(toJsonRecord(outcome));
}

function toJsonRecord(outcome: SendOutcome): Record<string, unknown> {
  if (outcome.kind === "accept") {
    const record: Record<string, unknown> = {
      code: outcome.code,
      controlId: outcome.ackControlId,
      durationMs: outcome.durationMs,
      host: outcome.target.host,
      ok: true,
      port: outcome.target.port,
      requestControlId: outcome.request.controlId,
    };
    if (outcome.text !== undefined) {
      record.text = outcome.text;
    }
    return record;
  }

  if (outcome.kind === "nak") {
    const record: Record<string, unknown> = {
      code: outcome.code,
      controlId: outcome.ackControlId,
      durationMs: outcome.durationMs,
      host: outcome.target.host,
      kind: "nak",
      ok: false,
      port: outcome.target.port,
      requestControlId: outcome.request.controlId,
    };
    if (outcome.errorCode !== undefined) {
      record.errorCode = outcome.errorCode;
    }
    if (outcome.severity !== undefined) {
      record.severity = outcome.severity;
    }
    if (outcome.text !== undefined) {
      record.text = outcome.text;
    }
    return record;
  }

  if (outcome.kind === "transport") {
    const record: Record<string, unknown> = {
      code: outcome.code,
      host: outcome.target.host,
      kind: "transport",
      message: outcome.message,
      ok: false,
      port: outcome.target.port,
    };
    if (outcome.request !== undefined) {
      record.requestControlId = outcome.request.controlId;
    }
    return record;
  }

  const record: Record<string, unknown> = {
    kind: "invalid",
    message: outcome.message,
    ok: false,
  };
  if (outcome.target !== undefined) {
    record.host = outcome.target.host;
    record.port = outcome.target.port;
  }
  return record;
}
