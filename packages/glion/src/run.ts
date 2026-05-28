import { runDev } from "./commands/dev.js";
import { runStart } from "./commands/start.js";

/** Inlined by tsdown via `define` at build time. */
declare const __GLION_VERSION__: string;

// Re-exports for the stable `glion` public surface.
export { defineConfig } from "./config/index.js";
export type { GlionConfig } from "./config/index.js";
export { GlionError } from "./errors.js";
export type { GlionErrorKind } from "./errors.js";
export { encode, parseLine } from "./events.js";
export type { DistributiveOmit, Event, PartialEvent } from "./events.js";

export interface RunGlionOptions {
  argv: string[];
  cwd: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

const HELP_TEXT = `glion — MLLP server dev tool

Usage:
  glion dev   [--config <path>]   Start dev server with live TUI and file watcher
  glion start [--config <path>]   Start production server (no TUI, JSON-line stdout)
  glion --help                    Show this help
  glion --version                 Show version

Flags may appear in any position, before or after the subcommand.

Config:
  By default glion looks for glion.config.ts / .mts / .mjs / .js,
  .glionrc.ts / .js, or "glion" field in package.json. If neither is
  found, it looks for a conventional entry file (glion.app.ts or
  src/glion.app.ts) and runs with defaults.

Network binding:
  glion dev   defaults to hostname "127.0.0.1" (loopback only).
  glion start defaults to hostname "0.0.0.0" (all interfaces) —
    suitable for deployment behind a firewall or reverse proxy.
    Override with \`hostname: "127.0.0.1"\` in your config if you
    want loopback-only in production.

  MLLP has no built-in authentication. Running \`glion start\` on a
  publicly-reachable interface without TLS sends clinical traffic
  in cleartext; glion emits a warning event at startup when it
  detects this posture. Configure \`tls\` or bind to 127.0.0.1 for
  any untrusted network.
`;

interface ParsedArgs {
  command: "dev" | "start" | "help" | "version";
  configPath?: string;
}

type ParseResult =
  | { ok: true; args: ParsedArgs }
  | { ok: false; error: string };

function parseArgs(argv: readonly string[]): ParseResult {
  const positional: string[] = [];
  let configPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string;
    if (arg === "--help" || arg === "-h") {
      return { args: { command: "help" }, ok: true };
    }
    if (arg === "--version" || arg === "-v") {
      return { args: { command: "version" }, ok: true };
    }
    if (arg === "--config") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        return { error: "--config requires a path argument", ok: false };
      }
      configPath = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return { error: `unknown flag: ${arg}`, ok: false };
    }
    positional.push(arg);
  }

  if (positional.length === 0) {
    return { args: { command: "help" }, ok: true };
  }
  if (positional.length > 1) {
    return { error: `unexpected argument: ${positional[1]}`, ok: false };
  }
  const command = positional[0];
  if (command !== "dev" && command !== "start") {
    return { error: `unknown command: ${command}`, ok: false };
  }
  return { args: { command, configPath }, ok: true };
}

export function runGlion(opts: RunGlionOptions): Promise<number> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  const parsed = parseArgs(opts.argv);
  if (!parsed.ok) {
    stderr.write(`glion: ${parsed.error}\n\n${HELP_TEXT}`);
    return Promise.resolve(1);
  }

  switch (parsed.args.command) {
    case "help": {
      stdout.write(HELP_TEXT);
      return Promise.resolve(0);
    }
    case "version": {
      stdout.write(`glion ${__GLION_VERSION__}\n`);
      return Promise.resolve(0);
    }
    case "start": {
      return runStart({
        configPath: parsed.args.configPath,
        cwd: opts.cwd,
        stderr,
        stdout,
      });
    }
    case "dev": {
      return runDev({
        configPath: parsed.args.configPath,
        cwd: opts.cwd,
        stderr,
        stdout,
      });
    }
    default: {
      return assertNever(parsed.args.command);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command: ${JSON.stringify(value)}`);
}
