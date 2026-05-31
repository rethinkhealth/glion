/**
 * `glion send` — send one HL7v2 message over MLLP and report the ACK.
 *
 * This module currently exposes only the pure argument parser. The
 * command handler (target resolution, message read, structural gate,
 * MLLP exchange, rendering) lands in later increments. Keeping the
 * parser pure and standalone makes it exhaustively unit-testable
 * without sockets, config loading, or process state.
 */

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
