/**
 * `glion send` — send one HL7v2 message over MLLP and report the ACK.
 *
 * It exposes the pure pieces — the argument parser (`parseSendArgs`) and the
 * structural gate (`parseAndGate`), both exhaustively unit-testable without IO
 * — plus the `runSend` handler that wires target resolution, message reading,
 * the MLLP exchange, and rendering together.
 */

import { readFile } from "node:fs/promises";

import { AckException } from "@glion/ack";
import type { Root } from "@glion/ast";
import { MllpClient, MllpClientError } from "@glion/mllp-client";
import type { MllpConnector } from "@glion/mllp-client";
import { connectNode } from "@glion/mllp-client/node";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

import { renderHuman, renderJson } from "./send-render.js";
import type { SendNakOutcome, SendOutcome } from "./send-render.js";
import { resolveTarget } from "./send-target.js";

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
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("-")) {
    return { error: `${flag} requires a value` };
  }
  return next;
}

/**
 * Reads the integer value of a flag at `index`. Folds the missing-value
 * and non-integer checks into one call so the parse loop carries a single
 * guard per integer flag.
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
      const flagValue = takeFlagValue(argv, i, "--host");
      if (typeof flagValue === "object") {
        return { error: flagValue.error, ok: false };
      }
      host = flagValue;
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
      const flagValue = argv[i + 1];
      if (flagValue === undefined || flagValue.startsWith("-")) {
        return { error: "--config requires a path argument", ok: false };
      }
      configPath = flagValue;
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
  // bootstrap slices positionally — char[3] -> MSH-1, chars[4..7] -> MSH-2 —
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

const ENCODER = new TextEncoder();

const SEND_HELP_TEXT = `glion send — send one HL7v2 message over MLLP and print the ACK

Usage:
  glion send [<file>] [flags]

Message source:
  <file>                 path to an HL7v2 message file
                         omit it (or pass "-") to read the message from stdin

Target:
  --host <host>          target host
  --port <port>          target port
  --local                read host/port from glion.config.ts (this project's
                         server); --host/--port override individual fields

Options:
  --config <path>        config file to resolve --local (same discovery as dev/start)
  --timeout <ms>         deadline spanning connect + ACK wait (default 30000)
  --json                 print one JSON line instead of the human exchange view
  -h, --help             show this help

Exit codes:
  0  the peer accepted the message (AA/CA)
  1  the peer rejected the message (NAK: AE/AR/CE/CR)
  2  the message could not be delivered (transport, validation, or usage error)

TLS targets are not supported yet.
`;

export interface RunSendOptions {
  argv: readonly string[];
  cwd: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  /** Runtime connector; injectable for tests. Defaults to the Node TCP adapter. */
  connect?: MllpConnector;
  /** Stdin source used when no file is given; injectable for tests. */
  stdin?: NodeJS.ReadableStream;
}

function exitCodeFor(outcome: SendOutcome): number {
  switch (outcome.kind) {
    case "accept": {
      return 0;
    }
    case "nak": {
      return 1;
    }
    default: {
      // transport and invalid both mean "not delivered".
      return 2;
    }
  }
}

/** Read a readable stream to a UTF-8 string (used for stdin). */
async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  stream.setEncoding("utf8");
  let data = "";
  for await (const chunk of stream) {
    data += chunk;
  }
  return data;
}

/** The peer's MSA-3 free text, when present and non-empty. */
function ackText(tree: Root | undefined): string | undefined {
  if (!tree) {
    return undefined;
  }
  const found = value(tree, "MSA-3.1")?.value;
  if (!found) {
    return undefined;
  }
  return found;
}

/**
 * `glion send` handler. Resolves the target, reads and structurally gates the
 * message, sends it over MLLP, and renders the outcome — the human exchange
 * view on a TTY, otherwise a single JSON line. Returns the process exit code;
 * it never calls process.exit, mirroring runDev/runStart.
 */
export async function runSend(opts: RunSendOptions): Promise<number> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  const parsed = parseSendArgs(opts.argv);
  if (!parsed.ok) {
    stderr.write(`glion send: ${parsed.error}\n\n${SEND_HELP_TEXT}`);
    return 2;
  }
  const { args } = parsed;
  if (args.help) {
    stdout.write(SEND_HELP_TEXT);
    return 0;
  }

  // JSON when piped or explicitly requested; the human exchange view on a TTY.
  // `isTTY` lives on NodeJS.WriteStream, not the wider WritableStream type.
  const useJson = args.json || (stdout as { isTTY?: boolean }).isTTY !== true;
  const emit = (outcome: SendOutcome): number => {
    const line = useJson ? renderJson(outcome) : renderHuman(outcome);
    const isError = outcome.kind === "transport" || outcome.kind === "invalid";
    const sink = !useJson && isError ? stderr : stdout;
    sink.write(`${line}\n`);
    return exitCodeFor(outcome);
  };

  const resolved = await resolveTarget(args, opts.cwd);
  if (!resolved.ok) {
    return emit({ kind: "invalid", message: resolved.reason });
  }
  const target = { host: resolved.host, port: resolved.port };

  let text: string;
  try {
    text =
      args.file === undefined
        ? await readStream(opts.stdin ?? process.stdin)
        : await readFile(args.file, "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return emit({
      kind: "invalid",
      message: `Could not read the message: ${reason}`,
      target,
    });
  }

  const gate = parseAndGate(text);
  if (!gate.ok) {
    return emit({ kind: "invalid", message: gate.message, target });
  }

  // Serialize once: this canonical, CR-delimited form is both what goes on the
  // wire and the byte count we report. Sending the string (not the tree) keeps
  // the reported bytes identical to what is transmitted.
  const canonical = toHl7v2(gate.tree);
  const timeoutMs = args.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  const request = {
    byteCount: ENCODER.encode(canonical).length,
    controlId: value(gate.tree, "MSH-10.1")?.value ?? "",
    segmentCount: gate.tree.children.length,
  };

  const client = new MllpClient({
    connect: opts.connect ?? connectNode,
    connectTimeoutMs: timeoutMs,
    host: target.host,
    port: target.port,
    sendTimeoutMs: timeoutMs,
  });

  const startedAt = performance.now();
  try {
    await client.connect();
    const res = await client.send(canonical, { timeoutMs });
    return emit({
      ackControlId: res.controlId,
      code: res.code,
      durationMs: res.durationMs,
      kind: "accept",
      request,
      target,
      text: ackText(res.tree),
    });
  } catch (error) {
    if (error instanceof AckException) {
      return emit({
        ackControlId: error.controlId ?? "",
        // AckException is thrown only for NAKs, so the code is AE/AR/CE/CR.
        code: error.code as SendNakOutcome["code"],
        durationMs: performance.now() - startedAt,
        errorCode: error.errorCode,
        kind: "nak",
        request,
        severity: error.severity,
        target,
        text: ackText(error.tree),
      });
    }
    if (error instanceof MllpClientError) {
      return emit({
        code: error.code,
        kind: "transport",
        message: error.message,
        request,
        target,
      });
    }
    throw error;
  } finally {
    await client.close();
  }
}
