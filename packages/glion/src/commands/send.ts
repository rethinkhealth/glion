/**
 * `glion send` — send one HL7v2 message over MLLP and report the ACK.
 *
 * It exposes the pure `parseSendArgs` parser (exhaustively unit-testable
 * without IO) plus the `runSend` handler that wires target resolution, message
 * reading, the MLLP exchange, and rendering together.
 */

import { readFile } from "node:fs/promises";
import type { ConnectionOptions } from "node:tls";

import { AckException } from "@glion/ack";
import type { Root } from "@glion/ast";
import {
  MllpClient,
  MllpClientError,
  MllpInvalidMessageError,
} from "@glion/mllp-client";
import type { MllpClientOptions, MllpSocket } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";
import { parseHL7v2 } from "@glion/parser";
import { EscapeSequenceError, toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

import { MAX_PORT } from "../constants";
import { causeMessage } from "../errors";
import { renderConnected, renderHuman, renderJson } from "./send-render";
import type {
  ConnectionSecurity,
  SendOutcome,
  SendRequestSummary,
  SendTarget,
} from "./send-render";
import { dialTarget, resolveDestination } from "./send-target";

/** Connect + ACK-wait deadline used when `--timeout` is omitted. */
export const DEFAULT_SEND_TIMEOUT_MS = 30_000;

/**
 * Parsed `glion send` invocation.
 *
 * - `file` — positional message source. `undefined` or `"-"` both mean "read from
 *   stdin"; the handler treats them identically.
 * - `host` / `port` — the target to send to.
 * - `tls` — the TLS to dial with, or `undefined` to dial in plaintext.
 * - `timeoutMs` — deadline spanning connect + ACK wait.
 * - `json` — force JSON output even on a TTY.
 * - `help` — print subcommand help instead of sending.
 */
export interface SendTlsArgs {
  /** The authority to verify the receiver's certificate against. */
  ca?: string;
  /** The client certificate to present. */
  cert?: string;
  /** The private key for that certificate. */
  key?: string;
  /** Whether to dial without verifying the receiver's certificate. */
  insecure: boolean;
}

export interface SendArgs {
  file?: string;
  host?: string;
  port?: number;
  tls?: SendTlsArgs;
  timeoutMs?: number;
  json: boolean;
  help: boolean;
}

export type ParseSendResult =
  | { ok: true; args: SendArgs }
  | { ok: false; error: string };

/**
 * Reads the token after a value flag at `index`, treating an end-of-argv, an
 * empty token, and a following `-`-prefixed token as "no value supplied". A
 * returned `string` is the captured value; a `{ error }` object is a usage
 * failure.
 */
function takeFlagValue(
  argv: readonly string[],
  index: number,
  flag: string
): string | { error: string } {
  const next = argv[index + 1];
  if (next === undefined || next === "" || next.startsWith("-")) {
    return { error: `\`${flag}\` takes a value.` };
  }
  return next;
}

/**
 * Reads the positive integer value of a flag at `index`. Folds the
 * missing-value, non-integer, and zero checks into one call so the parse loop
 * carries a single guard per integer flag.
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
    return { error: `\`${flag}\` takes a whole number.` };
  }
  return Number.parseInt(raw, 10);
}

/**
 * Reads the port value of `--port` at `index`. Folds the missing-value,
 * non-integer, and out-of-range checks into one call so the parse loop carries
 * a single guard for the flag — and so a port no host can listen on is
 * rejected here, not after a dial that cannot succeed.
 */
function takePortValue(
  argv: readonly string[],
  index: number
): number | { error: string } {
  const parsed = takeIntFlagValue(argv, index, "--port");
  if (typeof parsed === "object") {
    return parsed;
  }
  if (parsed < 1 || parsed > MAX_PORT) {
    return { error: `\`--port\` takes a port between 1 and ${MAX_PORT}.` };
  }
  return parsed;
}

/**
 * Reads the millisecond value of `--timeout` at `index`. A deadline of zero
 * is no deadline at all, so it is refused with the flag's own sentence.
 */
function takeTimeoutValue(
  argv: readonly string[],
  index: number
): number | { error: string } {
  const parsed = takeIntFlagValue(argv, index, "--timeout");
  if (typeof parsed === "object") {
    return parsed;
  }
  if (parsed === 0) {
    return { error: "`--timeout` takes a number of milliseconds above zero." };
  }
  return parsed;
}

/**
 * Pure parser for the argv that follows the `send` subcommand token.
 *
 * Mirrors the return shape and style of `parseArgs` in `run.ts`: a
 * left-to-right scan, value flags consuming the next token, unknown
 * `-`-prefixed tokens rejected, and at most one positional accepted.
 * It never throws and never touches process state.
 */
// oxlint-disable-next-line complexity/complexity -- left-to-right flag scan: one branch per flag
export function parseSendArgs(argv: readonly string[]): ParseSendResult {
  const positional: string[] = [];
  let host: string | undefined;
  let port: number | undefined;
  let timeoutMs: number | undefined;
  let tls = false;
  let insecure = false;
  let ca: string | undefined;
  let cert: string | undefined;
  let key: string | undefined;
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
      const parsed = takePortValue(argv, i);
      if (typeof parsed === "object") {
        return { error: parsed.error, ok: false };
      }
      port = parsed;
      i += 1;
      continue;
    }
    if (arg === "--tls") {
      tls = true;
      continue;
    }
    if (arg === "--insecure") {
      insecure = true;
      continue;
    }
    if (arg === "--ca" || arg === "--cert" || arg === "--key") {
      const flagValue = takeFlagValue(argv, i, arg);
      if (typeof flagValue === "object") {
        return { error: flagValue.error, ok: false };
      }
      if (arg === "--ca") {
        ca = flagValue;
      } else if (arg === "--cert") {
        cert = flagValue;
      } else {
        key = flagValue;
      }
      i += 1;
      continue;
    }
    if (arg === "--timeout") {
      const parsed = takeTimeoutValue(argv, i);
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
      return { error: `\`${arg}\` is not a \`glion send\` flag.`, ok: false };
    }
    positional.push(arg);
  }

  if (positional.length > 1) {
    return { error: "`glion send` takes one message source.", ok: false };
  }

  // "-" and absence both mean stdin; collapse the sentinel to undefined
  // so the handler has a single "no file" representation.
  const rawFile = positional[0];
  const file = rawFile === undefined || rawFile === "-" ? undefined : rawFile;

  // Naming any TLS material is asking for TLS, so `--tls` is only needed when
  // the invocation names none.
  const wantsTls =
    tls ||
    insecure ||
    ca !== undefined ||
    cert !== undefined ||
    key !== undefined;

  return {
    args: {
      file,
      help,
      host,
      json,
      port,
      timeoutMs,
      tls: wantsTls ? { ca, cert, insecure, key } : undefined,
    },
    ok: true,
  };
}

const ENCODER = new TextEncoder();

const SEND_HELP_TEXT = `glion send — send one HL7v2 message over MLLP and print the ACK

Usage:
  glion send [<file>] [flags]

Message source:
  <file>                 path to an HL7v2 message file
                         omit it (or pass "-") to read the message from stdin

Target:
  --host <host>          target host
  --port <port>          target port; defaults to 2575, the MLLP standard

TLS:
  --tls                  dial over TLS, verified against the system's authorities
  --ca <path>            the authority that signed the receiver's certificate,
                         or its own certificate when it signed itself
  --cert <path>          client certificate to present
  --key <path>           the private key for that certificate
  --insecure             dial over TLS without verifying the certificate
                         (any TLS flag dials over TLS; --tls is for the rest)

Options:
  --timeout <ms>         deadline spanning connect + ACK wait (default 30000)
  --json                 print one JSON line instead of the human exchange view
  -h, --help             show this help

Exit codes:
  0  the peer accepted the message (AA/CA)
  1  the peer rejected the message (NAK: AE/AR/CE/CR)
  2  the message could not be delivered (transport, validation, or usage error)
`;

export interface RunSendOptions {
  argv: readonly string[];
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  /** Runtime socket; injectable for tests. Defaults to the Node TCP adapter. */
  socket?: MllpSocket;
  /** Reconnect policy; injectable for tests. Defaults to the client's. */
  reconnect?: MllpClientOptions["reconnect"];
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
    case "transport":
    case "invalid": {
      // Both mean "not delivered".
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

/** The message text a source holds, or why it could not be read. */
type ReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; cause?: string };

/**
 * Reads the message from the file `args` names, or from stdin when it names
 * none. A source that cannot be read is a `reason` naming it, with the
 * underlying error as the `cause`.
 */
async function readMessageText(
  args: SendArgs,
  opts: RunSendOptions
): Promise<ReadResult> {
  try {
    const text =
      args.file === undefined
        ? await readStream(opts.stdin ?? process.stdin)
        : await readFile(args.file, "utf8");
    return { ok: true, text };
  } catch (error) {
    const cause = causeMessage(error);
    const reason =
      args.file === undefined
        ? "Standard input could not be read."
        : `The message source \`${args.file}\` could not be read.`;
    return { cause, ok: false, reason };
  }
}

/**
 * How `tls` secures the connection: not at all, encrypted with the peer's
 * certificate verified, or encrypted with verification turned off.
 */
function securityOf(tls: ConnectionOptions | undefined): ConnectionSecurity {
  if (tls === undefined) {
    return "plain";
  }
  if (tls.rejectUnauthorized === false) {
    return "tls-unverified";
  }
  return "tls";
}

/**
 * Writes the connection's facts to `sink` as the client reports them: the
 * line for the connection opening, how it is secured, with the time since the
 * dial began. A connection that goes down is the exchange's own outcome.
 */
function reportConnection(
  client: MllpClient,
  target: SendTarget,
  tls: ConnectionOptions | undefined,
  sink: NodeJS.WritableStream
): void {
  const security = securityOf(tls);
  const dialedAt = performance.now();
  client.on("connect", () => {
    const durationMs = performance.now() - dialedAt;
    sink.write(`${renderConnected(target, durationMs, security)}\n`);
  });
}

/**
 * Maps a failed exchange to its outcome. A NAK, a message the client could
 * not prepare, and a transport failure are outcomes; anything else is a bug
 * and propagates.
 */
function sendErrorOutcome(
  error: unknown,
  exchange: {
    request: SendRequestSummary;
    target: SendTarget;
    startedAt: number;
  }
): SendOutcome {
  const { request, target, startedAt } = exchange;
  if (error instanceof AckException) {
    return {
      ackControlId: error.controlId ?? "",
      code: error.code,
      durationMs: performance.now() - startedAt,
      errorCode: error.errorCode,
      kind: "nak",
      request,
      severity: error.severity,
      target,
      text: error.text,
    };
  }
  if (error instanceof MllpInvalidMessageError) {
    return {
      cause: causeMessage(error.cause),
      code: error.code,
      kind: "invalid",
      message: error.message,
      request,
      target,
    };
  }
  if (error instanceof MllpClientError) {
    return {
      cause: causeMessage(error.cause),
      code: error.code,
      delivery: error.delivery,
      kind: "transport",
      message: error.message,
      request,
      target,
    };
  }
  throw error;
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

  const destination = await resolveDestination(args);
  if (!destination.ok) {
    return emit({
      cause: destination.cause,
      hint: destination.hint,
      kind: "invalid",
      message: destination.reason,
      target: destination.target,
    });
  }
  const { target, tls } = destination;

  const read = await readMessageText(args, opts);
  if (!read.ok) {
    return emit({
      cause: read.cause,
      kind: "invalid",
      message: read.reason,
      target,
    });
  }

  // Parse to a tree, then re-serialize to canonical, CR-delimited form. The
  // parser is lenient — it never rejects — so this only normalizes the wire
  // bytes (line endings in particular); whether the message is a *valid* HL7v2
  // message is the receiver's call, surfaced as a NAK. We do not pre-validate.
  const tree = parseHL7v2(read.text);
  const prepared = prepareRequest(tree);
  if (!prepared.ok) {
    return emit({ kind: "invalid", message: prepared.reason, target });
  }
  const { request } = prepared;
  const timeoutMs = args.timeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;

  let client: MllpClient | undefined;
  let startedAt = performance.now();
  try {
    client = new MllpClient({
      connectTimeoutMs: timeoutMs,
      reconnect: opts.reconnect,
      sendTimeoutMs: timeoutMs,
      socket: opts.socket ?? nodeSocket(() => dialTarget(target, tls)),
    });
    if (!useJson) {
      reportConnection(client, target, tls, stderr);
    }
    await client.connect();
    startedAt = performance.now();
    const res = await client.send(tree, { timeoutMs });
    return emit({
      ackControlId: res.controlId,
      code: res.code,
      durationMs: performance.now() - startedAt,
      kind: "accept",
      request,
      target,
      text: res.text,
    });
  } catch (error) {
    return emit(sendErrorOutcome(error, { request, startedAt, target }));
  } finally {
    await client?.close();
  }
}

/** The request a message becomes on the wire, or why it cannot be sent. */
type RequestResult =
  | { ok: true; request: SendRequestSummary }
  | { ok: false; reason: string };

/**
 * The request `tree` becomes on the wire, or why it cannot be sent.
 *
 * Writing the message is what can fail: the delimiters MSH-1 and MSH-2 declare
 * may leave a character of its own with no escape sequence to write it.
 */
function prepareRequest(tree: Root): RequestResult {
  try {
    const canonical = toHl7v2(tree);
    return {
      ok: true,
      request: {
        byteCount: ENCODER.encode(canonical).length,
        controlId: value(tree, "MSH.10.1")?.value ?? "",
        segmentCount: tree.children.length,
      },
    };
  } catch (error) {
    if (error instanceof EscapeSequenceError) {
      return { ok: false, reason: error.message };
    }
    throw error;
  }
}
