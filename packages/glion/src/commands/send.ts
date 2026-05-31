/**
 * `glion send` — send one HL7v2 message over MLLP and report the ACK.
 *
 * This module exposes the pure, side-effect-free pieces of the command:
 * the argument parser (`parseSendArgs`) and the structural gate
 * (`parseAndGate`). The command handler (target resolution, message read,
 * MLLP exchange, rendering) lands in later increments. Keeping these pure
 * makes them exhaustively unit-testable without sockets, config loading,
 * or process state.
 */

import type { Root } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";

/** Connect + ACK-wait deadline used when `--timeout` is omitted. */
export const DEFAULT_SEND_TIMEOUT_MS = 30_000;

/**
 * Parsed `glion send` invocation.
 *
 * - `file` — positional message source. `undefined` or `"-"` both mean "read from
 *   stdin"; the handler treats them identically.
 * - `host` / `port` — explicit target. When `--local` is set these override the
 *   individual fields derived from the config.
 * - `local` — derive host/port from the project's `glion.config.ts`.
 * - `configPath` — config file used to resolve `--local` (same discovery as
 *   `dev`/`start`).
 * - `timeoutMs` — deadline spanning connect + ACK wait.
 * - `json` — force JSON output even on a TTY.
 * - `help` — print subcommand help instead of sending.
 */
export interface SendArgs {
  file?: string;
  host?: string;
  port?: number;
  local: boolean;
  configPath?: string;
  timeoutMs?: number;
  json: boolean;
  help: boolean;
}

export type ParseSendResult =
  | { ok: true; args: SendArgs }
  | { ok: false; error: string };

/**
 * Reads the token after a value flag at `index`, treating an end-of-argv
 * or a following `-`-prefixed token as "no value supplied". A returned
 * `string` is the captured value; a `{ error }` object is a usage failure.
 */
function takeFlagValue(
  argv: readonly string[],
  index: number,
  flag: string
): string | { error: string } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-")) {
    return { error: `${flag} requires a value` };
  }
  return value;
}

/**
 * Reads the integer value of a flag at `index`. Folds the missing-value
 * and non-integer checks into one call so the parse loop carries a single
 * guard per integer flag. A clean base-10 form is required: `Number("12abc")`
 * is `NaN` and `Number("1.5")` is non-integer, but `Number("0x10")` /
 * `Number(" 12 ")` would slip through a bare `Number()` cast.
 */
function takeIntFlagValue(
  argv: readonly string[],
  index: number,
  flag: string
): number | { error: string } {
  const raw = takeFlagValue(argv, index, flag);
  if (typeof raw === "object") {
    return raw;
  }
  if (!/^\d+$/.test(raw)) {
    return { error: `${flag} requires an integer value, got: ${raw}` };
  }
  return Number.parseInt(raw, 10);
}

/**
 * Pure parser for the argv that follows the `send` subcommand token.
 *
 * Mirrors the return shape and style of `parseArgs` in `run.ts`: a
 * left-to-right scan, value flags consuming the next token, unknown
 * `-`-prefixed tokens rejected, and at most one positional accepted.
 * It never throws and never touches process state.
 */
export function parseSendArgs(argv: readonly string[]): ParseSendResult {
  const positional: string[] = [];
  let host: string | undefined;
  let port: number | undefined;
  let local = false;
  let configPath: string | undefined;
  let timeoutMs: number | undefined;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--local") {
      local = true;
      continue;
    }
    if (arg === "--host") {
      const value = takeFlagValue(argv, i, "--host");
      if (typeof value === "object") {
        return { error: value.error, ok: false };
      }
      host = value;
      i += 1;
      continue;
    }
    if (arg === "--port") {
      const parsed = takeIntFlagValue(argv, i, "--port");
      if (typeof parsed === "object") {
        return { error: parsed.error, ok: false };
      }
      port = parsed;
      i += 1;
      continue;
    }
    if (arg === "--config") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { error: "--config requires a path argument", ok: false };
      }
      configPath = value;
      i += 1;
      continue;
    }
    if (arg === "--timeout") {
      const parsed = takeIntFlagValue(argv, i, "--timeout");
      if (typeof parsed === "object") {
        return { error: parsed.error, ok: false };
      }
      timeoutMs = parsed;
      i += 1;
      continue;
    }
    // The bare "-" sentinel is a positional meaning "read from stdin",
    // not an unknown flag — accept it before the flag-rejection branch.
    if (arg !== "-" && arg.startsWith("-")) {
      return { error: `Unknown flag: ${arg}`, ok: false };
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    return { error: `Unexpected argument: ${positional[1]}`, ok: false };
  }

  // "-" and absence both mean stdin; collapse the sentinel to undefined
  // so the handler has a single "no file" representation.
  const rawFile = positional[0];
  const file = rawFile === undefined || rawFile === "-" ? undefined : rawFile;

  return {
    args: { configPath, file, help, host, json, local, port, timeoutMs },
    ok: true,
  };
}

/**
 * Outcome of the structural gate: either a canonical {@link Root} parsed from a
 * message that leads with a real MSH header, or a precise reason why the input
 * is not an HL7v2 message.
 *
 * The reason maps to exit code 2 and the `{"ok":false,"kind":"invalid"}` JSON
 * line the handler emits; `message` is the authored, human-readable
 * explanation.
 */
export type GateResult =
  | { ok: true; tree: Root }
  | { ok: false; message: string };

/** First three characters every HL7v2 message must carry. */
const MSH_SEGMENT_NAME = "MSH";

/**
 * Parses the raw message and confirms it leads with a real MSH header.
 *
 * `@glion/parser` is fully lenient — it never throws and turns any string into
 * a tree, always labelling the first segment "MSH" regardless of its real
 * three-character prefix (the MSH bootstrap in the tokenizer only fires when
 * the input literally starts with "MSH"). So "leads with a real MSH header" is
 * enforced here in two parts:
 *
 * 1. The text must begin with the uppercase segment ID `MSH` — without it, the
 *    parser never bootstraps delimiters and the first field carries no
 *    separator. This also rejects empty input, plain prose, JSON, and a non-MSH
 *    leading segment in one check.
 * 2. The character right after `MSH` must be a real field separator (MSH-1) — a
 *    non-alphanumeric, non-whitespace delimiter — and the header must carry
 *    encoding characters (MSH-2). This rejects a truncated `MSH`, `MSHxyz` (the
 *    positional bootstrap would otherwise read "x" as MSH-1), and `MSH|`.
 */
export const parseAndGate = (text: string): GateResult => {
  if (text.length === 0) {
    return {
      message:
        "The message is empty (no bytes were read from the file or stdin).",
      ok: false,
    };
  }
  if (!text.startsWith(MSH_SEGMENT_NAME)) {
    return {
      message:
        'Not an HL7v2 message: it must begin with an MSH segment. The first three characters must be the uppercase segment ID "MSH".',
      ok: false,
    };
  }

  // The character at index 3 is the field separator (MSH-1). It must be a
  // real delimiter, not a letter, digit, or whitespace: the tokenizer's MSH
  // bootstrap slices positionally — char[3] → MSH-1, chars[4..7] → MSH-2 —
  // so it treats "MSHxyz" as MSH-1 "x", MSH-2 "yz" even though no separator
  // is present. Requiring a non-alphanumeric, non-space separator is what
  // distinguishes a true header ("MSH|^~\\&|...") from a stray "MSH" prefix.
  const fieldSeparator = text.charAt(MSH_SEGMENT_NAME.length);
  if (fieldSeparator.length === 0 || /[A-Za-z0-9\s]/.test(fieldSeparator)) {
    return {
      message:
        'Not an HL7v2 message: the MSH header is missing its field separator (MSH-1). A valid header looks like "MSH|^~\\&|...".',
      ok: false,
    };
  }

  // Read MSH-2 from the same raw string as MSH-1, not from the parsed tree:
  // the tokenizer populates MSH-2 by positionally slicing a fixed window after
  // "MSH", so a tree-based check would only assert "some chars follow the
  // separator", accepting a stray "MSH|X". The encoding characters are the run
  // between the field separator (index 3) and the next field separator.
  const encodingStart = MSH_SEGMENT_NAME.length + 1;
  const nextSeparator = text.indexOf(fieldSeparator, encodingStart);
  const encodingCharacters = text.slice(
    encodingStart,
    nextSeparator === -1 ? undefined : nextSeparator
  );
  if (encodingCharacters.length === 0) {
    return {
      message:
        'Not an HL7v2 message: the MSH header is missing its encoding characters (MSH-2). A valid header looks like "MSH|^~\\&|...".',
      ok: false,
    };
  }

  return { ok: true, tree: parseHL7v2(text) };
};
