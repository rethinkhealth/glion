import { clearTimeout, setTimeout as nodeSetTimeout } from "node:timers";

import type * as ChokidarModule from "chokidar";

import { GlionError } from "../errors.js";

type Chokidar = typeof ChokidarModule;

// ─── Public interface ──────────────────────────────────────────────

export interface WatcherOptions {
  /**
   * How long to wait after the last filesystem event before firing
   * the change listener. Defaults to 150ms.
   *
   * Editors often trigger multiple events per save (write temp file,
   * rename over original, update metadata). The debounce collapses
   * these into a single notification so the supervisor doesn't
   * restart N times for one Ctrl-S.
   */
  debounceMs?: number;
}

/** Payload delivered to change listeners after the debounce settles. */
export interface WatcherEvent {
  /** Absolute paths of all files that changed within the debounce window. */
  files: string[];
}

/**
 * The public handle returned by `createWatcher`. Consumers wire up
 * listeners and eventually call `close()` to release the OS watch
 * handles.
 */
export interface Watcher {
  /** Register a listener for debounced file change batches. */
  onChange(listener: (event: WatcherEvent) => void): () => void;
  /**
   * Register a listener for filesystem errors (EACCES, ENOSPC, EMFILE).
   * The watcher stays alive after errors so manual reload still works —
   * only continuous watching is impaired.
   */
  onError(listener: (error: Error) => void): () => void;
  /** Release all OS watch handles and cancel pending debounce timers. */
  close(): Promise<void>;
}

// ─── Factory ───────────────────────────────────────────────────────

/**
 * Creates a file watcher backed by chokidar.
 *
 * ## Why chokidar instead of `fs.watch`
 *
 * Node's built-in `fs.watch` has well-known platform inconsistencies:
 * no recursive watching on Linux, duplicate events on macOS, missing
 * events on network filesystems. chokidar normalizes all of this.
 * It's an optional dependency — only `glion dev` uses it; `glion start`
 * (production) never watches files.
 *
 * ## Debounce strategy
 *
 * Rather than restarting the server on every individual filesystem
 * event, we accumulate changed paths into a `pending` set and flush
 * them as a single batch after `debounceMs` of quiet. This means:
 *
 * - A single save → one restart (even if the editor fires 3 events)
 * - Rapid saves within the window → one restart with all changed files
 * - The timer resets on each new event (trailing-edge debounce)
 *
 * ## Lifecycle
 *
 *     createWatcher(paths)
 *         │
 *         ▼
 *     chokidar.watch() ──→ OS inotify / FSEvents / kqueue handles
 *         │
 *         │  file event (change/add/unlink)
 *         ▼
 *     onPathEvent() ──→ add to pending set, reset debounce timer
 *         │
 *         │  debounceMs of silence
 *         ▼
 *     flush() ──→ notify all onChange listeners with { files: [...] }
 *         │
 *         ▼ (on error)
 *     onError listeners ──→ surface as warning, watcher stays alive
 *         │
 *         ▼ (on close)
 *     clear timer, clear pending, release OS handles
 *
 * @param paths - Absolute paths to watch (directories or files).
 *   Defaults to `config.watch` which is typically `[dirname(entry)]`.
 */
export async function createWatcher(
  paths: string[],
  options: WatcherOptions = {}
): Promise<Watcher> {
  const debounceMs = options.debounceMs ?? 150;

  // Dynamic import: chokidar is an optional dependency. Users who
  // only run `glion start` (production) never load it.
  const chokidar = await importChokidar();
  const watcher = chokidar.watch(paths, {
    // Don't fire for files that already exist when the watcher starts.
    ignoreInitial: true,
    // Keep the Node process alive while watching.
    persistent: true,
  });

  // ── Internal state ───────────────────────────────────────────
  const changeListeners = new Set<(event: WatcherEvent) => void>();
  const errorListeners = new Set<(error: Error) => void>();

  /** Paths that changed since the last flush. Acts as a dedup set. */
  const pending = new Set<string>();

  /** Active debounce timer, or null when idle. */
  let timer: ReturnType<typeof nodeSetTimeout> | null = null;

  /** Once true, all events are silently dropped. */
  let closed = false;

  // ── Debounce mechanics ───────────────────────────────────────

  /**
   * Fires when the debounce window expires. Drains the pending set
   * into a single WatcherEvent and broadcasts it to all listeners.
   */
  const flush = (): void => {
    timer = null;
    if (closed || pending.size === 0) {
      return;
    }
    const files = [...pending];
    pending.clear();
    for (const listener of changeListeners) {
      listener({ files });
    }
  };

  /**
   * Called on every chokidar event (change, add, unlink). Adds the
   * path to the pending set and resets the debounce timer. This is
   * a trailing-edge debounce: the flush fires `debounceMs` after
   * the LAST event, not the first.
   */
  const onPathEvent = (path: string): void => {
    if (closed) {
      return;
    }
    pending.add(path);
    if (timer) {
      clearTimeout(timer);
    }
    timer = nodeSetTimeout(flush, debounceMs);
  };

  // ── Wire up chokidar events ──────────────────────────────────
  // Three event types cover all filesystem mutations:
  //   change — file content modified (the common case)
  //   add    — new file created in a watched directory
  //   unlink — file deleted
  watcher.on("change", onPathEvent);
  watcher.on("add", onPathEvent);
  watcher.on("unlink", onPathEvent);

  // Filesystem errors (permissions, disk full, too many open files)
  // are surfaced to listeners but don't kill the watcher. This is
  // intentional: even if continuous watching breaks, the user can
  // still trigger manual reloads (r key in TUI).
  watcher.on("error", (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    for (const listener of errorListeners) {
      listener(err);
    }
  });

  // ── Return the public handle ─────────────────────────────────
  return {
    async close() {
      // Mark as closed FIRST so any in-flight debounce timer
      // that fires between now and clearTimeout is a no-op.
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      pending.clear();
      // Release OS file watch handles (inotify fds, FSEvents streams).
      await watcher.close();
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Lazily imports chokidar. It's an optional dependency — only needed
 * for `glion dev`. If missing, the error message tells the user
 * exactly what to install.
 */
async function importChokidar(): Promise<Chokidar> {
  try {
    return await import("chokidar");
  } catch (error) {
    throw new GlionError(
      "peer-dep-missing",
      "The 'glion dev' command requires 'chokidar' for file watching.",
      { missing: "chokidar" },
      "Install it:\n  pnpm add -D chokidar",
      error
    );
  }
}
