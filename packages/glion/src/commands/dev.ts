import { loadConfig } from "../config/load.js";
import { GlionError } from "../errors.js";
import { encode } from "../events.js";
import type { FileLogger } from "../file-logger.js";
import { createFileLogger } from "../file-logger.js";
import { GlionSupervisor } from "../parent/supervisor.js";
import type { Watcher } from "../parent/watcher.js";
import { createWatcher } from "../parent/watcher.js";
import { ensureCacheDir, prepareChild } from "../prebuild.js";
import { createStore } from "../tui/store.js";

export interface RunDevOptions {
  cwd: string;
  configPath?: string;
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

/**
 * Dev entry — the orchestrator behind `glion dev`.
 *
 * Unlike `runStart` (which is a lean event pipe), dev mode weaves
 * together four subsystems that must cooperate:
 *
 * Config loader → Prebuild → Supervisor → File watcher
 * ↑              │
 * └── rebuild ←──┘
 *
 * The watcher and supervisor form a feedback loop: a file change
 * triggers a rebuild, which produces a fresh manifest, which the
 * supervisor picks up on the next child spawn. The child itself is
 * stateless — it reads the manifest once at startup and never
 * checks for changes.
 *
 * Output is adaptive: TTY gets an interactive TUI (Ink), non-TTY
 * gets JSON lines (same wire format as `glion start`). The branch
 * happens late so all setup work is shared.
 */
export async function runDev(opts: RunDevOptions): Promise<number> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;

  // Declared outside try so `finally` can clean them up regardless
  // of which branch (interactive vs headless) we took.
  let supervisor: GlionSupervisor | null = null;
  let watcher: Watcher | null = null;
  // oxlint-disable-next-line prefer-const
  let fileLogger: FileLogger | null = null;

  try {
    // --- Shared setup (both TTY and non-TTY) ---

    // The cache directory is the single source of compiled artifacts.
    // Created first because both config loading (transform) and entry
    // building (build) write into it.
    const cacheDir = await ensureCacheDir(opts.cwd);

    // Config is compiled (TS → JS via rolldown transform), imported
    // natively, then validated by Zod. mode:"dev" defaults hostname
    // to 127.0.0.1 so the dev server isn't exposed beyond localhost.
    const config = await loadConfig({
      cacheDir,
      cwd: opts.cwd,
      explicitPath: opts.configPath,
      mode: "dev",
    });

    // The entry file goes through rolldown build() — not transform() —
    // because it may import from local TS modules (routes, handlers).
    // build() bundles those while leaving node_modules external.
    // The manifest JSON is the IPC contract: it contains the compiled
    // entry path + every server option the child needs.
    const manifestPath = await prepareChild(config, cacheDir);

    // The supervisor owns the child lifecycle. In dev mode its crash
    // policy auto-respawns once, then halts on repeated crashes within
    // a stability window to avoid infinite restart loops.
    supervisor = new GlionSupervisor({
      cwd: opts.cwd,
      gracefulCloseMs: config.gracefulCloseMs,
      manifestPath,
      mode: "dev",
    });

    // Optionally persist every event to a rotating NDJSON file.
    // The `enabled` gate lives inside createFileLogger — it returns
    // null when disabled. Useful in dev for "what happened just
    // before I stepped away" forensics; the TUI itself only shows
    // recent events.
    fileLogger = await createFileLogger(config.logging);
    if (fileLogger) {
      stderr.write(`glion: writing logs to ${fileLogger.path}\n`);
      supervisor.onEvent((event) => {
        fileLogger?.write(event);
      });
    }

    // The watcher completes the feedback loop. chokidar monitors the
    // configured paths (defaults to dirname(entry)). On any change:
    //
    //   1. prepareChild() re-runs rolldown build() → fresh .glion/*.js
    //   2. supervisor.restart() kills the old child, spawns a new one
    //      that reads the updated manifest
    //
    // The rebuild MUST complete before restart — otherwise the new
    // child would import stale compiled output. The async IIFE ensures
    // this sequencing while keeping the onChange callback synchronous
    // (chokidar requires it).
    watcher = await createWatcher(config.watch);
    watcher.onChange(() => {
      void (async () => {
        try {
          await prepareChild(config, cacheDir);
        } catch (error) {
          // Build failed (syntax error, missing import, etc.) — surface
          // it as a warning and keep the current child running. The user
          // will save again once they fix the error, triggering another
          // rebuild. This is critical for autosave workflows where the
          // file is saved mid-keystroke.
          const msg = error instanceof Error ? error.message : String(error);
          stderr.write(`glion dev: rebuild failed: ${msg}\n`);
          return;
        }
        supervisor?.restart("file-change");
      })();
    });
    // oxlint-disable-next-line prefer-await-to-callbacks
    watcher.onError((err) => {
      stderr.write(`glion dev: watcher error: ${err.message}\n`);
    });

    // --- Output mode branch ---
    //
    // TTY (user at a terminal): Ink renders a live dashboard that
    // rewrites lines in place — status, connections, throughput,
    // hotkeys. This requires a real terminal; piped output would
    // produce garbage.
    //
    // Non-TTY (pipe, CI, Docker): clean JSON lines on stdout, same
    // wire format as `glion start`. Tools can parse with `jq`,
    // log aggregators ingest it directly.
    return process.stdout.isTTY
      ? await runInteractive(supervisor, watcher)
      : await runHeadless(supervisor, stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.write(`glion dev: ${message}\n`);
    if (error instanceof GlionError && error.hint) {
      stderr.write(`\n${error.hint}\n`);
    }
    return 1;
  } finally {
    // Cleanup runs on every exit path — normal return, thrown error,
    // or signal. Order matters:
    //   1. watcher first  — no new restarts fire mid-shutdown.
    //   2. supervisor    — emits final closing/closed/exit events.
    //   3. file logger   — flushes those final events to disk.
    await watcher?.close();
    await supervisor?.stop();
    await fileLogger?.close();
  }
}

/**
 * Interactive TUI mode.
 *
 * Uses Ink (React for the terminal) to render a live dashboard:
 * server status, active connections, message throughput, uptime,
 * and keyboard shortcuts (r = reload, q = quit).
 *
 * Ink and React are dynamically imported so non-TTY users never
 * pull them in — they're optional dependencies. This is why
 * `renderTui` uses `await import()` instead of a top-level import.
 *
 * The store is a simple event-sourced state container: each child
 * event dispatches into it, and Ink re-renders on state change.
 * The store is NOT shared with the child — the child only emits
 * events, the parent owns the view state.
 */
async function runInteractive(
  supervisor: GlionSupervisor,
  watcher: Watcher
): Promise<number> {
  const store = createStore();
  supervisor.onEvent((event) => {
    store.dispatch(event);
  });

  // Dynamic import: Ink + React are heavy and optional. Users who
  // only pipe output (non-TTY) never load these modules.
  const { renderTui } = await import("../tui/app.js");
  const ui = renderTui({
    hotkeys: {
      // Quit: tear down supervisor → watcher → unmount Ink. The
      // async IIFE is fire-and-forget because Ink's hotkey handler
      // must be synchronous.
      onQuit: () => {
        void (async () => {
          await supervisor.stop();
          await watcher.close();
          ui.unmount();
        })();
      },
      // Manual reload: user presses 'r' → supervisor kills the
      // current child and spawns a fresh one (same as file-change
      // restart but user-triggered).
      onReload: () => {
        void supervisor.restart("manual");
      },
    },
    startedAt: Date.now(),
    store,
  });

  // Start the child AFTER the TUI is mounted so the first `ready`
  // event is captured and displayed immediately.
  supervisor.start();
  try {
    // This is where the dev server "runs." Ink owns the event loop —
    // it processes keypresses, re-renders on store changes, and
    // manages the terminal's alternate screen buffer. This await
    // only resolves when the user quits (q key, or Ctrl-C which
    // Ink intercepts and translates to an exit).
    await ui.waitUntilExit();
  } catch {
    // Ink render errors (terminal resize race, broken pipe) should
    // not kill the server. Unmount the TUI and let the caller's
    // finally block handle cleanup.
    ui.unmount();
  }
  return 0;
}

/**
 * Headless mode — the non-TTY counterpart of `runInteractive`.
 *
 * No TUI, no Ink, no React. Events flow straight from supervisor
 * to stdout as JSON lines. This is the mode CI systems, Docker
 * containers, and piped workflows see.
 *
 * Uses the same convergence pattern as `runStart`: a manually-
 * resolved promise (`Promise.withResolvers`) parks the function
 * until a termination signal arrives. Two sources can trigger it:
 *
 * 1. SIGINT / SIGTERM — user or process manager asks to stop
 * 2. Supervisor `fatal` event — crash policy exhausted, no more auto-respawns
 *
 * Both call `done()` which resolves the promise and unblocks the
 * await. The `finally` block then deregisters signal listeners
 * and unsubscribes from supervisor events to prevent leaks.
 */
async function runHeadless(
  supervisor: GlionSupervisor,
  stdout: NodeJS.WritableStream
): Promise<number> {
  let done!: () => void;
  // oxlint-disable-next-line promise/avoid-new -- manual withResolvers for Node 18 compat
  const promise = new Promise<true>((resolve) => {
    done = () => {
      resolve(true);
    };
  });

  // One subscriber that does both jobs: forward to stdout AND detect
  // a fatal to unblock the await. Two separate onEvent calls used to
  // live here and only the first captured its unsubscribe — the
  // fatal-detection closure leaked on every runGlion invocation.
  // Merging also collapses the (theoretical) ordering ambiguity
  // between write-first and done-first.
  const unsubscribe = supervisor.onEvent((event) => {
    stdout.write(encode(event));
    if (event.t === "fatal") {
      // Supervisor halted (startup crash or repeated runtime crashes
      // past the stability window) — no more auto-respawns coming.
      done();
    }
  });

  // Listen for shutdown signals. Unlike `runStart`, we don't need
  // double-signal escalation (force exit on second Ctrl-C) because
  // dev mode's crash policy already handles hung children.
  process.on("SIGINT", done);
  process.on("SIGTERM", done);

  try {
    supervisor.start();
    // Park here — the server runs until done() is called.
    await promise;
    return 0;
  } finally {
    // Deregister everything to prevent memory leaks and stale
    // writes to a closed stdout.
    process.off("SIGINT", done);
    process.off("SIGTERM", done);
    unsubscribe();
  }
}
