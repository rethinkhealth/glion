import { clearTimeout, setTimeout as nodeSetTimeout } from "node:timers";
import { fileURLToPath } from "node:url";

import type { Event, PartialEvent } from "../events.js";
import type { ChildHandle, ExitInfo } from "./spawn.js";
import { spawnChild as defaultSpawnChild } from "./spawn.js";

/**
 * Absolute path to the compiled child runner script.
 *
 * Resolved once at module load via `import.meta.url`. This works
 * because tsdown places all shared chunks at the `dist/` root, so
 * `child/runner.js` is always a sibling path. Tests can override
 * via the `runnerPath` option; production code uses this default.
 */
export const RUNNER_PATH = fileURLToPath(
  new URL("child/runner.js", import.meta.url)
);

export type SupervisorMode = "dev" | "start";

// ─── Timeouts ──────────────────────────────────────────────────────

/**
 * Maximum time a child has to emit a `ready` event after spawn.
 * If this fires, the child is declared unresponsive and killed.
 * 30s is generous — a healthy child typically readies in <1s.
 */
const STARTUP_TIMEOUT_MS = 30_000;

/**
 * How long a child must stay up after `ready` before the runtime-
 * crash counter resets. This prevents a flaky "ready → crash →
 * respawn → ready → crash" loop from running forever: if the
 * second crash happens within this window, the supervisor halts.
 */
const STABILITY_WINDOW_MS = 30_000;

// ─── Public interface ──────────────────────────────────────────────

export interface GlionSupervisorOptions {
  mode: SupervisorMode;
  /** Defaults to the compiled child/runner.js alongside this module. */
  runnerPath?: string;
  /** Absolute path to .glion/manifest.json — written before each spawn. */
  manifestPath: string;
  /** Working directory for the child process. */
  cwd: string;
  /** Milliseconds to wait for graceful shutdown before SIGKILL. */
  gracefulCloseMs: number;
  /** Injectable for tests. Defaults to `parent/spawn.ts::spawnChild`. */
  spawn?: typeof defaultSpawnChild;
  /** Injectable clock for deterministic tests. */
  nowIso?: () => string;
}

// ─── Internal types ────────────────────────────────────────────────

/**
 * Extended child handle with supervisor-internal bookkeeping.
 *
 * These fields track where the child is in its lifecycle so
 * `classifyExit` can determine the correct crash policy action.
 */
interface InternalChild extends ChildHandle {
  /** True once the child emitted `ready` — it passed the startup phase. */
  ready: boolean;
  /** True when WE asked the child to stop (SIGTERM from restart/stop). */
  intentionalShutdown: boolean;
  /** True once the child emitted its own `fatal` event on stdout. */
  childEmittedFatal: boolean;
  /** Startup watchdog timer — fires if `ready` never arrives. */
  readyTimer: ReturnType<typeof nodeSetTimeout> | null;
  /** Stability timer — resets crash counter after a stable run. */
  stabilityTimer: ReturnType<typeof nodeSetTimeout> | null;
}

/**
 * Discriminated union of every way a child exit can be classified.
 * `classifyExit` produces one of these; `watchExit` switches on it
 * to decide the supervisor's response.
 *
 * - `stale` — this child was already replaced (restart race)
 * - `intentional` — we asked it to stop (restart, stop, or watchdog kill)
 * - `startup-crash` — died before emitting `ready`
 * - `runtime-crash-respawn` — crashed after `ready`, first time (dev)
 * - `runtime-crash-halt` — crashed again within the stability window (dev)
 * - `runtime-crash-propagate` — crashed in production mode, propagate exit code
 */
type ExitOutcome =
  | { kind: "stale" }
  | { kind: "intentional" }
  | { kind: "startup-crash" }
  | { kind: "runtime-crash-respawn" }
  | { kind: "runtime-crash-halt" }
  | { kind: "runtime-crash-propagate" };

type EventListener = (event: Event) => void;
type ExitListener = (
  code: number | null,
  signal: NodeJS.Signals | null
) => void;

// ─── Supervisor ────────────────────────────────────────────────────

/**
 * Owns the child process lifecycle: start, restart, stop.
 *
 * ## Concurrency model
 *
 * The supervisor serializes all mutating operations (restart, stop)
 * through a promise chain (`this.tail`). This guarantees:
 *
 * - At most one child is alive at any time
 * - A stop() cannot be outraced by a queued restart()
 * - Multiple rapid file-change restarts collapse naturally (each waits for the
 *   previous kill before spawning)
 *
 * ## Crash policy
 *
 * The supervisor classifies every child exit into one of six outcomes
 * (see `ExitOutcome`) and responds accordingly:
 *
 * | Scenario                        | Mode  | Response                        |
 * | ------------------------------- | ----- | ------------------------------- |
 * | Exit before `ready`             | any   | Fatal event, no respawn         |
 * | No `ready` within 30s           | any   | Kill + fatal (unresponsive)     |
 * | Crash after `ready`, first time | dev   | Warning + auto-respawn once     |
 * | Crash after `ready`, repeated   | dev   | Fatal, halt (avoid crash loops) |
 * | Crash after `ready`             | start | Propagate exit code to parent   |
 *
 * The stability window (30s) prevents flaky services from respawning
 * indefinitely: if the child crashes twice within the window, the
 * supervisor stops trying.
 *
 * ## Event flow
 *
 *     child stdout (JSON lines)
 *         │
 *         ▼
 *     onEvent listeners ──→ TUI store (dev) / stdout pipe (start)
 *         │
 *         ▼ (on "ready")
 *     clear startup watchdog, start stability timer
 *         │
 *         ▼ (on "fatal")
 *     mark childEmittedFatal to suppress duplicate fatal on exit
 *
 *     child stderr ──→ warning events (surfaced but non-fatal)
 *
 *     child exit ──→ classifyExit() ──→ watchExit() switch
 */
export class GlionSupervisor {
  private readonly mode: SupervisorMode;
  private readonly runnerPath: string;
  private readonly manifestPath: string;
  private readonly cwd: string;
  private readonly spawn: typeof defaultSpawnChild;
  private readonly gracefulCloseMs: number;
  private readonly nowIso: () => string;

  /** The currently active child, or null between restarts. */
  private child: InternalChild | null = null;

  /** Listeners that receive every structured event from the child. */
  private readonly eventListeners = new Set<EventListener>();

  /** Listeners notified when the child process exits (any reason). */
  private readonly exitListeners = new Set<ExitListener>();

  /**
   * Tail of the serialized operation chain.
   *
   * Every call to restart() or stop() appends to this chain via
   * enqueue(). This is the mechanism that prevents concurrent
   * spawns — each operation awaits the previous one's completion
   * before executing.
   */
  private tail: Promise<unknown>;

  /** Once true, no new children will be spawned. */
  private stopped = false;

  /**
   * How many times the child has crashed after `ready` within the
   * current stability window. Resets to 0 after STABILITY_WINDOW_MS
   * of uninterrupted uptime.
   */
  private runtimeCrashCount = 0;

  constructor(options: GlionSupervisorOptions) {
    this.mode = options.mode;
    this.runnerPath = options.runnerPath ?? RUNNER_PATH;
    this.manifestPath = options.manifestPath;
    this.cwd = options.cwd;
    this.spawn = options.spawn ?? defaultSpawnChild;
    this.gracefulCloseMs = options.gracefulCloseMs;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    // Seed with a resolved promise so the first enqueue() doesn't
    // need a special case.
    // oxlint-disable-next-line prefer-await-to-then
    this.tail = (async () => {})();
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Subscribe to child events. Returns an unsubscribe function.
   * Events are the structured JSON objects the child writes to stdout
   * (ready, msg, error, fatal, etc.).
   */
  onEvent(listener: EventListener): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  /**
   * Subscribe to child exit notifications. Fires on every exit —
   * including intentional restarts. Use `onEvent` with `t === "fatal"`
   * if you only care about terminal failures.
   */
  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  /** Spawn the first child. No-op if already stopped. */
  start(): void {
    if (this.stopped) {
      return;
    }
    this.doSpawnChild();
  }

  /**
   * Kill the current child and spawn a new one. The operation is
   * enqueued — if a previous restart or stop is in progress, this
   * waits for it to finish first.
   */
  restart(reason: "manual" | "file-change"): Promise<void> {
    return this.enqueue(async () => {
      if (this.stopped) {
        return;
      }
      this.fireEvent({ reason, t: "reload" });
      await this.killCurrentChild();
      this.doSpawnChild();
    });
  }

  /**
   * Permanently stop the supervisor. Kills the current child and
   * prevents any future spawns. Enqueued so it waits for in-flight
   * restarts to settle first.
   */
  stop(): Promise<void> {
    return this.enqueue(async () => {
      this.stopped = true;
      await this.killCurrentChild();
    });
  }

  // ── Serialization ────────────────────────────────────────────────

  /**
   * Appends a task to the sequential operation chain.
   *
   * This is the core concurrency primitive. `.then(task, task)` runs
   * the task regardless of whether the previous link resolved or
   * rejected. The `.catch()` on the tail prevents a rejected link
   * from stalling all future operations.
   *
   * Without this, rapid file changes could trigger overlapping
   * restart sequences — two children alive at once, port conflicts,
   * and event interleaving.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    // oxlint-disable-next-line prefer-await-to-then
    const next = this.tail.then(task, task);
    // oxlint-disable-next-line prefer-await-to-then
    this.tail = next.catch(() => {});
    return next;
  }

  // ── Spawn & lifecycle ────────────────────────────────────────────

  /**
   * Spawns a new child process and wires up all lifecycle tracking.
   *
   * The child receives the manifest path as an argv argument. It
   * reads the JSON manifest, imports the pre-built entry module,
   * and starts the MLLP server. All communication flows through
   * structured JSON events on stdout.
   */
  private doSpawnChild(): void {
    const handle = this.spawn({
      cwd: this.cwd,
      manifestPath: this.manifestPath,
      runnerPath: this.runnerPath,
    });

    // Wrap the raw ChildHandle with internal bookkeeping fields.
    const internal: InternalChild = Object.assign(handle, {
      childEmittedFatal: false,
      intentionalShutdown: false,
      ready: false,
      readyTimer: null as ReturnType<typeof nodeSetTimeout> | null,
      stabilityTimer: null as ReturnType<typeof nodeSetTimeout> | null,
    });
    this.child = internal;

    // ── Startup watchdog ──────────────────────────────────────────
    // If the child doesn't emit `ready` within STARTUP_TIMEOUT_MS,
    // something is wrong (hanging require, unhandled async, etc.).
    // Kill it and emit a fatal. .unref() prevents the timer from
    // keeping the parent alive if everything else has shut down.
    internal.readyTimer = nodeSetTimeout(() => {
      if (this.child === internal && !internal.ready) {
        this.fireEvent({
          context: { timeoutMs: STARTUP_TIMEOUT_MS },
          kind: "child-unresponsive",
          message: `Child did not emit 'ready' within ${STARTUP_TIMEOUT_MS}ms.`,
          t: "fatal",
        });
        internal.intentionalShutdown = true;
        internal.kill("SIGTERM");
      }
    }, STARTUP_TIMEOUT_MS);
    internal.readyTimer.unref?.();

    // ── Event wiring ─────────────────────────────────────────────
    handle.onEvent((event) => {
      if (event.t === "ready") {
        // The child has bound its port and is accepting connections.
        internal.ready = true;

        // Cancel the startup watchdog — it's no longer needed.
        if (internal.readyTimer) {
          clearTimeout(internal.readyTimer);
          internal.readyTimer = null;
        }

        // Start the stability timer. If the child survives this
        // window, the crash counter resets and it gets a fresh set
        // of respawn chances. A flaky "ready → crash → ready →
        // crash" loop never clears this timer because the crash
        // happens before it fires.
        internal.stabilityTimer = nodeSetTimeout(() => {
          this.runtimeCrashCount = 0;
        }, STABILITY_WINDOW_MS);
        internal.stabilityTimer.unref?.();
      } else if (event.t === "fatal") {
        // The child reported its own fatal (e.g. entry-load-failed,
        // port-in-use). Mark it so watchExit doesn't emit a
        // duplicate synthetic fatal — the event stream should have
        // exactly one fatal per failure.
        internal.childEmittedFatal = true;
      }

      // Forward every event to external listeners (TUI, stdout pipe).
      this.fireEvent(event);
    });

    // Surface child stderr as warning events. Stderr is non-structured
    // (raw text lines) — we wrap each line in a warning event so it
    // appears in the TUI and JSON output alongside structured events.
    handle.onStderrLine((line) => {
      this.fireEvent({
        message: `child stderr: ${line}`,
        t: "warning",
      });
    });

    // Begin watching for the child's exit — this runs concurrently.
    void this.watchExit(internal);
  }

  // ── Exit classification & response ───────────────────────────────

  /**
   * Awaits the child's exit, classifies it, and responds according
   * to the crash policy.
   *
   * This method runs concurrently with the rest of the supervisor.
   * It's fire-and-forget from doSpawnChild's perspective — the
   * `void` prefix makes that explicit.
   */
  private async watchExit(internal: InternalChild): Promise<void> {
    const exit = await internal.exited;
    clearChildTimers(internal);

    const outcome = this.classifyExit(internal, exit);

    // Stale: this child was already replaced by a restart. Another
    // watchExit is handling the new child. Nothing to do.
    if (outcome.kind === "stale") {
      return;
    }

    // Clear our reference — the child is gone.
    if (this.child === internal) {
      this.child = null;
    }

    // Notify exit listeners (used by `runStart` to unblock its
    // `await exited` convergence point).
    for (const listener of this.exitListeners) {
      listener(exit.code, exit.signal);
    }

    switch (outcome.kind) {
      // We asked it to stop — clean exit, nothing to report.
      case "intentional": {
        return;
      }

      // Died before emitting `ready`. This usually means the entry
      // file has a syntax error, a missing dependency, or the port
      // is already in use.
      case "startup-crash": {
        if (internal.childEmittedFatal) {
          // The child already published its own fatal via stdout
          // (e.g. entry-not-mllp-instance). Don't duplicate it.
          return;
        }
        this.fireEvent({
          context: { code: exit.code, signal: exit.signal },
          kind: "child-crashed",
          message: exit.error
            ? `Failed to spawn child: ${exit.error.message}`
            : `Child exited with code ${exit.code ?? "null"} before emitting ready.`,
          t: "fatal",
        });
        return;
      }

      // Dev mode, first crash after `ready`. Give it one more chance.
      case "runtime-crash-respawn": {
        this.fireEvent({
          message: "Child crashed after ready; respawning once.",
          t: "warning",
        });
        void this.enqueue(() => {
          if (!this.stopped) {
            this.doSpawnChild();
          }
          return Promise.resolve();
        });
        return;
      }

      // Dev mode, second crash within the stability window. Stop
      // respawning to prevent an infinite crash loop.
      case "runtime-crash-halt": {
        this.fireEvent({
          context: {
            code: exit.code,
            crashes: this.runtimeCrashCount,
            signal: exit.signal,
          },
          kind: "child-crashed",
          message:
            "Child crashed repeatedly after ready. Stopping auto-respawn.",
          t: "fatal",
        });
        return;
      }

      // Production mode: we don't auto-respawn. The exit listeners
      // already fired; the parent's main loop (runStart) will read
      // the exit code and shut down.
      case "runtime-crash-propagate": {
        return;
      }

      default: {
        assertNever(outcome);
      }
    }
  }

  /**
   * Pure classification — no side effects. Examines the child's
   * internal state and the supervisor's mode to determine what
   * kind of exit this was.
   */
  private classifyExit(internal: InternalChild, _exit: ExitInfo): ExitOutcome {
    // Another child has replaced this one (restart race condition).
    if (this.child !== internal) {
      return { kind: "stale" };
    }
    // We explicitly asked it to stop.
    if (internal.intentionalShutdown || this.stopped) {
      return { kind: "intentional" };
    }
    // Never got to `ready` — startup failure.
    if (!internal.ready) {
      return { kind: "startup-crash" };
    }
    // Production mode: always propagate, never respawn.
    if (this.mode !== "dev") {
      return { kind: "runtime-crash-propagate" };
    }
    // Dev mode: respawn on first crash, halt on repeated.
    this.runtimeCrashCount += 1;
    return this.runtimeCrashCount > 1
      ? { kind: "runtime-crash-halt" }
      : { kind: "runtime-crash-respawn" };
  }

  // ── Graceful shutdown ────────────────────────────────────────────

  /**
   * Sends SIGTERM to the current child and waits for it to exit.
   * If the child doesn't exit within `gracefulCloseMs`, escalates
   * to SIGKILL — the nuclear option that cannot be caught or ignored.
   *
   * The escalation timer is unref'd so it doesn't keep the parent
   * alive if the child exits cleanly and everything else has wound down.
   */
  private async killCurrentChild(): Promise<void> {
    const current = this.child;
    if (!current) {
      return;
    }
    current.intentionalShutdown = true;
    current.kill("SIGTERM");

    // Escalation: if SIGTERM is ignored, SIGKILL after the grace period.
    const forceKillTimer = nodeSetTimeout(() => {
      current.kill("SIGKILL");
      this.fireEvent({
        message: `Child did not exit within ${this.gracefulCloseMs}ms; sent SIGKILL.`,
        t: "warning",
      });
    }, this.gracefulCloseMs);
    forceKillTimer.unref?.();

    try {
      await current.exited;
    } finally {
      clearTimeout(forceKillTimer);
    }
  }

  // ── Event emission ───────────────────────────────────────────────

  /**
   * Stamps a partial event with the current timestamp and broadcasts
   * it to all listeners. The `ts` field can be pre-set (e.g. by the
   * child) or auto-stamped by the supervisor.
   */
  private fireEvent(event: PartialEvent): void {
    // Stamp ts only. Severity is type-determined via `eventLevel()`;
    // only the `log` variant carries an instance-level `level` that
    // callers supply on the partial.
    const stamped = { ts: this.nowIso(), ...event } as Event;
    for (const listener of this.eventListeners) {
      listener(stamped);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Cleans up both lifecycle timers on a child that has exited. */
function clearChildTimers(internal: InternalChild): void {
  if (internal.readyTimer) {
    clearTimeout(internal.readyTimer);
    internal.readyTimer = null;
  }
  if (internal.stabilityTimer) {
    clearTimeout(internal.stabilityTimer);
    internal.stabilityTimer = null;
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected exit outcome: ${JSON.stringify(value)}`);
}
