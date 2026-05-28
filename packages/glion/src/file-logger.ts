import { createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { finished } from "node:stream/promises";

import type { LogLevel } from "./config/logging.js";
import { LEVEL_RANK } from "./config/logging.js";
import { GlionError } from "./errors.js";
import type { Event } from "./events.js";
import { encode, eventLevel } from "./events.js";

/**
 * Self-contained options for `createFileLogger`. Deliberately flat —
 * the file logger doesn't import `ResolvedLogging` from the config
 * layer so it stays reusable as a primitive and can be unit-tested
 * against its own type, not the config surface. The caller maps
 * `config.logging` → these fields at the call site.
 *
 * The caller is also responsible for only constructing when logging
 * is enabled: there's no `enabled` field here, because creating a
 * logger for a disabled config is a no-op — `createFileLogger`
 * returns `null` instead of creating a logger, so callers don't
 * need an outer `if (enabled)` branch. They just ask for one and
 * check the result.
 */
export interface FileLoggerOptions {
  /**
   * When `false`, `createFileLogger` short-circuits: no directory,
   * no file, no stream. Returns `null` so the caller writes
   * `if (logger) …` at the wiring site — a single gate instead of
   * one at every call. Defaults to `true` (absent ≡ enabled).
   */
  enabled?: boolean;
  /** Absolute path to the directory where `.ndjson` files are written. */
  dir: string;
  /** How many log files to retain before rotation deletes the oldest. */
  maxFiles: number;
  /** Minimum severity to record. */
  level: LogLevel;
  /** Injectable clock for deterministic filenames in tests. */
  nowIso?: () => string;
  /** Injectable pid for deterministic filenames in tests. */
  pid?: number;
}

export interface FileLogger {
  /** Absolute path to the file being written. */
  readonly path: string;
  /**
   * Writes one event as an NDJSON line. Events whose effective level
   * is below the configured level are silently dropped. Post-close
   * writes are also silently dropped.
   */
  write(event: Event): void;
  /** Flushes buffered data and closes the file. Idempotent. */
  close(): Promise<void>;
}

/**
 * Creates a rotating NDJSON file logger for glion's event stream.
 *
 * ## What it writes
 *
 * One JSON object per line (NDJSON) — identical to what `glion start`
 * emits on stdout, so an ingestion tool that reads stdout can read
 * these files without transformation. Each line is the `Event` union
 * from `../events.ts` after encoding.
 *
 * ## Rotation
 *
 * On startup, the log directory is scanned for existing `.ndjson`
 * files. If the count would exceed `cfg.maxFiles` after adding this
 * run's file, the oldest files are deleted until exactly
 * `cfg.maxFiles - 1` remain, then the new file brings the total to
 * `cfg.maxFiles`. Sort order is lexicographic on filename — the
 * ISO-timestamp prefix guarantees this matches chronological order.
 *
 * ## Level filtering
 *
 * Each `Event` has a derived LogLevel (see `levelOf` below). An event
 * passes the filter when its numeric rank is `>=` the configured
 * level. `log` events use their per-event level (the original
 * `console.log` vs `console.warn` distinction) rather than a single
 * lumped-in value.
 *
 * ## Permissions
 *
 * - Dir created with mode 0700 (owner-only)
 * - File created with mode 0600 (owner-only rw)
 *
 * Logs may contain PHI from HL7v2 messages captured via the child's
 * console.log bridge; restricting perms to the owning user is the
 * baseline defense.
 *
 * ## Lifecycle
 *
 * Caller responsibilities: construct with `createFileLogger(opts)`,
 * subscribe `logger.write` to the supervisor's event stream, and
 * `await logger.close()` on shutdown. Late writes after close() are
 * dropped rather than erroring — realistic given signal handlers may
 * race with normal exit paths.
 */
// Overloads: narrow the return type based on the literal `enabled`.
// - `{ enabled: false }` → `null`
// - `{ enabled?: true | undefined }` → `FileLogger`
// - dynamic boolean (e.g. from config) → `FileLogger | null`
// This keeps test call sites (`createFileLogger(opts())` with enabled
// omitted) null-free while still forcing command call sites to
// branch, because their `enabled` is a runtime boolean.
export async function createFileLogger(
  opts: FileLoggerOptions & { enabled: false }
): Promise<null>;
export async function createFileLogger(
  opts: FileLoggerOptions & { enabled?: true | undefined }
): Promise<FileLogger>;
export async function createFileLogger(
  opts: FileLoggerOptions
): Promise<FileLogger | null>;
export async function createFileLogger(
  opts: FileLoggerOptions
): Promise<FileLogger | null> {
  // Disabled → bail before any I/O. The caller keeps a single
  // `if (logger)` at the wiring site; no outer gate needed.
  if (opts.enabled === false) {
    return null;
  }

  const nowIso = opts.nowIso ?? defaultNowIso;
  const pid = opts.pid ?? process.pid;

  // Ensure the log dir exists with owner-only perms. `recursive: true`
  // makes this idempotent — a re-run of glion doesn't error on an
  // already-present dir.
  await mkdir(opts.dir, { mode: 0o700, recursive: true });

  // Refuse to proceed if the log dir is a symlink. `mkdir({recursive:
  // true})` silently follows symlinks at the terminal path component,
  // so without this guard an attacker on a shared host who plants a
  // symlink at glion's log path can redirect every subsequent
  // rotation unlink() into a directory they control. Checking lstat
  // after mkdir closes that path — if the name we wrote to is a
  // symlink rather than a real directory, bail.
  //
  // Throws as a structured GlionError so the parent's fatalEvent()
  // surfaces the specific `log-dir-unsafe` kind (not the generic
  // `child-crashed`) and the operator gets an actionable hint.
  const dirStat = await lstat(opts.dir);
  if (!dirStat.isDirectory()) {
    throw new GlionError(
      "log-dir-unsafe",
      `Log dir ${opts.dir} is not a regular directory (likely a symbolic link); refusing to proceed.`,
      { dir: opts.dir },
      `Remove the symlink at ${opts.dir}, or set \`logging.dir\` in glion.config.ts to a real directory.`
    );
  }

  // Rotate BEFORE opening the new file so the new file's filename
  // never collides with an existing one we're about to delete, and
  // so the kept set is exactly (maxFiles - 1) + 1 new = maxFiles.
  await rotate(opts.dir, opts.maxFiles - 1);

  // Colons are reserved on Windows and awkward on URL-encoded paths,
  // so normalize them to dashes while keeping the ISO prefix
  // lexicographically sortable — "2026-04-17T10-00-00.000Z" still
  // sorts the same as the canonical ISO form.
  const safeIso = nowIso().replaceAll(":", "-");
  const filename = `${safeIso}-${pid}.ndjson`;
  const path = resolve(opts.dir, filename);

  // `flags: "w"` creates the file if absent and truncates if present.
  // `mode` is applied on creation — existing files' perms are not
  // changed, but we never expect to collide with an existing file
  // because the timestamp+pid prefix is run-unique.
  const stream = createWriteStream(path, { flags: "w", mode: 0o600 });
  // Swallow stream errors rather than letting them crash the parent.
  // Logging to disk is best-effort; a disk-full or revoked-perm
  // mid-run shouldn't take down the supervisor.
  stream.on("error", () => {
    // Intentionally silent. See above for rationale.
  });

  const threshold = LEVEL_RANK[opts.level];
  let closed = false;

  return {
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      // Wait for `finish` so buffered data is actually flushed before
      // we return. Callers await close() expecting the file to be
      // durable on disk when the promise resolves.
      stream.end();
      await finished(stream);
    },
    path,
    write(event) {
      if (closed) {
        return;
      }
      // `eventLevel()` is the single source of truth: fixed severities
      // come from the type-level table in events.ts, `log` carries its
      // own per-instance level. No drift surface.
      if (LEVEL_RANK[eventLevel(event)] < threshold) {
        return;
      }
      stream.write(encode(event));
    },
  };
}

function defaultNowIso(): string {
  return new Date().toISOString();
}

/**
 * Log filename pattern — ISO timestamp (colons replaced with dashes)
 * followed by a pid, ending in `.ndjson`. Matching this pattern
 * means rotation only touches files this logger itself created; a
 * user's README or backup in the log dir is left alone.
 */
const LOG_FILENAME_RE = /^\d{4}-\d{2}-\d{2}T[\d\-.]+Z-\d+\.ndjson$/;

/**
 * Deletes the oldest log files until at most `keep` remain.
 *
 * Ordering is lexicographic on filename, which matches chronological
 * order because every filename starts with a canonical ISO timestamp
 * prefix. No file-stat calls, no mtime reads — the name alone is
 * authoritative.
 */
async function rotate(dir: string, keep: number): Promise<void> {
  const entries = await readdir(dir);
  const logs = entries.filter((name) => LOG_FILENAME_RE.test(name)).toSorted();
  const deleteCount = Math.max(0, logs.length - keep);
  if (deleteCount === 0) {
    return;
  }
  await Promise.all(
    logs.slice(0, deleteCount).map(async (name) => {
      const path = resolve(dir, name);
      // Belt-and-suspenders: lstat before unlink so rotation only
      // removes regular files it could have created. unlink() on a
      // symlink only removes the symlink itself (not its target),
      // so this doesn't close a leak so much as make the intent
      // explicit — rotation is not supposed to touch anything it
      // didn't put there.
      const entryStat = await lstat(path);
      if (entryStat.isFile()) {
        await unlink(path);
      }
    })
  );
}
