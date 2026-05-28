import { spawn as defaultSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

import type { Event } from "../events.js";
import { parseLine } from "../events.js";
import { readLines } from "./line-reader.js";

// ─── Public types ──────────────────────────────────────────────────

export interface SpawnChildOptions {
  /** Absolute path to the compiled child runner (dist/child/runner.js). */
  runnerPath: string;
  /** Absolute path to .glion/manifest.json — the child's sole input. */
  manifestPath: string;
  /** Working directory for the child process. */
  cwd: string;
  /**
   * Maximum bytes we'll buffer from child stdout/stderr before
   * dropping an oversized line. Forwarded to the bounded line-reader.
   * Defaults to the reader's default (1 MiB) when omitted. Exposed
   * primarily so unit tests can exercise the overflow path with a
   * small cap; production callers should normally leave it unset.
   */
  maxLineLength?: number;
}

/**
 * Information available after a child process exits.
 *
 * Node's `close` event provides `code` and `signal`, but they follow
 * different rules depending on how the child terminated:
 *
 * - Normal exit: `code` is the exit code (0–255), `signal` is null
 * - Killed by signal: `code` is null, `signal` is the signal name
 * - Spawn failure: both may be null; `error` carries the underlying Error (ENOENT
 *   if the binary doesn't exist, EACCES if not executable, etc.)
 */
export interface ExitInfo {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

/**
 * The supervisor's view of a running child process.
 *
 * This is a minimal, testable abstraction over `ChildProcess`. The
 * supervisor never touches the raw ChildProcess — it only interacts
 * through this handle. Tests can provide a fake handle without
 * spawning real processes.
 */
export interface ChildHandle {
  /** OS process ID. 0 if the spawn failed before the OS assigned one. */
  pid: number;

  /**
   * Resolves when the child has fully exited AND all stdio streams
   * are closed. This is the `close` event, not `exit` — the
   * distinction matters because `exit` fires before stdio drains.
   * A child that writes a final `fatal` event and immediately
   * `process.exit(1)` would lose that event if we listened on `exit`.
   */
  exited: Promise<ExitInfo>;

  /** Send a signal to the child (default SIGTERM). */
  kill(signal?: NodeJS.Signals): void;

  /**
   * Subscribe to structured events from the child's stdout.
   * Each line is parsed as JSON; malformed lines are silently dropped.
   * Returns an unsubscribe function.
   */
  onEvent(listener: (event: Event) => void): () => void;

  /**
   * Subscribe to raw stderr lines. These are unstructured text —
   * console.error output, Node warnings, native addon messages.
   * The supervisor wraps them in `warning` events.
   * Returns an unsubscribe function.
   */
  onStderrLine(listener: (line: string) => void): () => void;
}

// ─── Injectable dependency ─────────────────────────────────────────

/**
 * Allows tests to inject a custom `spawn` function without spawning
 * real processes. The spawn.test.ts suite uses this to simulate
 * child behavior (stdout events, exit codes, signals) deterministically.
 */
interface SpawnDeps {
  spawn?: typeof defaultSpawn;
}

// ─── Spawn ─────────────────────────────────────────────────────────

/**
 * Spawns the child runner as a subprocess and returns a handle.
 *
 * ## Process invocation
 *
 *     process.execPath  opts.runnerPath  opts.manifestPath
 *           │                │                │
 *           ▼                ▼                ▼
 *         /usr/bin/node  dist/child/runner.js  .glion/manifest.json
 *
 * `process.execPath` is the binary that launched the parent — Node,
 * Bun, or Deno. This ensures the child runs on the same runtime.
 * The runner receives exactly one argument: the manifest path. It
 * reads the manifest JSON, imports the compiled entry, and starts
 * the MLLP server.
 *
 * ## stdio configuration
 *
 *     stdin:  "pipe"    — closed on parent death; child self-exits
 *                         via SIGTERM when stdin emits "end"
 *     stdout: "pipe"    — structured JSON events, one per line
 *     stderr: "pipe"    — unstructured text (warnings, errors)
 *
 * Stdout is the primary communication channel. Each line is a JSON
 * object conforming to the `Event` union type (ready, msg, error,
 * fatal, etc.). stderr is secondary — it carries raw text that the
 * supervisor surfaces as `warning` events. The stdin pipe is the
 * orphan-detection mechanism: see `src/child/runner.ts` for the
 * listener that self-signals SIGTERM when the parent goes away.
 *
 * ## Why `close` instead of `exit`
 *
 * Node emits `exit` when the process terminates, but stdio streams
 * may still have buffered data. `close` fires after both the process
 * exits AND all stdio streams are fully drained. This ordering
 * guarantee ensures we never miss a child's final event (e.g. a
 * `fatal` written just before `process.exit(1)`).
 *
 * ## Error handling
 *
 * Spawn failures (binary not found, permission denied) emit an
 * `error` event BEFORE `close`. We capture the error and attach it
 * to `ExitInfo` so the supervisor can distinguish "child crashed"
 * from "child never started."
 */
export function spawnChild(
  opts: SpawnChildOptions,
  deps: SpawnDeps = {}
): ChildHandle {
  const spawn = deps.spawn ?? defaultSpawn;

  const child: ChildProcess = spawn(
    process.execPath,
    [opts.runnerPath, opts.manifestPath],
    {
      cwd: opts.cwd,
      // stdin is piped so the child can detect parent death: when the
      // parent exits (or crashes), the pipe closes and the child's
      // stdin emits "end", triggering a self-exit. Without this, a
      // crashed parent leaves an orphan child holding the port.
      // stdout and stderr are piped for structured event parsing.
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  // ── stdout: structured JSON events ─────────────────────────────
  //
  // Our bounded line-reader splits the pipe into lines with a cap on
  // how much the parent will buffer (default 1 MiB). Each line is
  // parsed as a JSON Event; malformed lines (e.g. a stray
  // console.log in user code that leaked to stdout) are silently
  // dropped by parseLine.
  //
  // If the child ever writes a line larger than the cap, onOverflow
  // fires — we synthesize a `warning` event with the dropped byte
  // count so the TUI / log aggregator can surface the loss instead
  // of silently missing events.
  const eventListeners = new Set<(event: Event) => void>();
  if (child.stdout) {
    readLines(
      child.stdout,
      (line) => {
        const event = parseLine(line);
        if (event) {
          for (const listener of eventListeners) {
            listener(event);
          }
        }
      },
      {
        maxLineLength: opts.maxLineLength,
        onOverflow: (bytes) => {
          const warning: Event = {
            message: `child stdout dropped ${bytes} bytes (line exceeded max length)`,
            t: "warning",
            ts: new Date().toISOString(),
          };
          for (const listener of eventListeners) {
            listener(warning);
          }
        },
      }
    );
  }

  // ── stderr: raw text lines ─────────────────────────────────────
  //
  // Stderr is unstructured — it may contain Node deprecation
  // warnings, native addon messages, or accidental console.error
  // calls in user code. Each line is forwarded to listeners; the
  // supervisor wraps them in `warning` events. Oversized stderr
  // lines are replaced with a short marker so the supervisor still
  // gets *some* signal that output was dropped.
  const stderrListeners = new Set<(line: string) => void>();
  if (child.stderr) {
    readLines(
      child.stderr,
      (line) => {
        for (const listener of stderrListeners) {
          listener(line);
        }
      },
      {
        maxLineLength: opts.maxLineLength,
        onOverflow: (bytes) => {
          for (const listener of stderrListeners) {
            listener(
              `[child stderr dropped ${bytes} bytes (line exceeded max length)]`
            );
          }
        },
      }
    );
  }

  // ── Exit tracking ──────────────────────────────────────────────
  //
  // The `exited` promise is the supervisor's primary way of knowing
  // the child is gone. It resolves on `close` (not `exit`) to
  // guarantee all stdout events have been delivered first.
  //
  // Spawn errors (ENOENT, EACCES) arrive via the `error` event
  // BEFORE `close`. We capture them so the supervisor can tell the
  // difference between "child ran and crashed" vs "child never ran."
  let resolveExited!: (info: ExitInfo) => void;
  // oxlint-disable-next-line no-new, promise/avoid-new -- manual Promise.withResolvers for Node 18 compat
  const exited = new Promise<ExitInfo>((resolve) => {
    resolveExited = resolve;
  });

  let spawnError: Error | undefined;
  child.on("error", (err) => {
    spawnError = err;
  });

  child.on("close", (code, signal) => {
    resolveExited({ code, error: spawnError, signal });
  });

  // ── Return the handle ──────────────────────────────────────────
  return {
    // pid is 0 if spawn failed before the OS assigned one (ENOENT).
    exited,
    kill(signal: NodeJS.Signals = "SIGTERM") {
      child.kill(signal);
    },
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    onStderrLine(listener) {
      stderrListeners.add(listener);
      return () => {
        stderrListeners.delete(listener);
      };
    },
    pid: child.pid ?? 0,
  };
}
