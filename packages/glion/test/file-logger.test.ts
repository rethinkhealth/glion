import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GlionError } from "../src/errors.js";
import type { Event } from "../src/events.js";
import type { FileLoggerOptions } from "../src/file-logger.js";
import { createFileLogger } from "../src/file-logger.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-file-logger-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

/**
 * Builds a complete `FileLoggerOptions` with `enabled: true` baked
 * in as a literal — that way `createFileLogger`'s overload resolves
 * to the non-null return, and tests never have to narrow away null.
 * The `enabled: false` path is tested once below with opts passed
 * inline, not through this helper.
 */
function opts(
  overrides: Omit<Partial<FileLoggerOptions>, "enabled"> = {}
): FileLoggerOptions & { enabled: true } {
  return {
    dir,
    enabled: true,
    level: "info",
    maxFiles: 10,
    nowIso: () => "2026-04-17T10-00-00.000Z",
    pid: 42_000,
    ...overrides,
  };
}

async function readAll(filePath: string): Promise<Event[]> {
  const contents = await readFile(filePath, "utf8");
  return contents
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Event);
}

describe("createFileLogger", () => {
  it("returns null when enabled is false and creates no directory", async () => {
    // The `enabled` gate lives INSIDE the primitive, not in each
    // caller. Callers ask for a logger; if the config says no, they
    // get null and wire nothing. No filesystem side effects, no
    // stray directories.
    const untouched = join(dir, "should-not-exist");
    // Constructed inline (not via opts()) so we can pass
    // `enabled: false` — the helper forces enabled: true as a literal
    // so other tests get non-null returns without narrowing.
    const logger = await createFileLogger({
      dir: untouched,
      enabled: false,
      level: "info",
      maxFiles: 10,
    });
    expect(logger).toBeNull();
    await expect(stat(untouched)).rejects.toThrow();
  });

  it("creates a file whose name includes the ISO timestamp and pid", async () => {
    const logger = await createFileLogger(opts());
    await logger.close();

    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const [file] = files;
    expect(file).toContain("2026-04-17T10-00-00.000Z");
    expect(file).toContain("42000");
    expect(file?.endsWith(".ndjson")).toBe(true);
  });

  it("creates the log dir if it doesn't exist yet", async () => {
    const nested = join(dir, "nested", "logs");
    const logger = await createFileLogger(opts({ dir: nested }));
    await logger.close();

    const info = await stat(nested);
    expect(info.isDirectory()).toBe(true);
  });

  it("creates the log file with mode 0600 (owner-only)", async () => {
    const logger = await createFileLogger(opts());
    await logger.close();

    const [name] = await readdir(dir);
    const info = await stat(join(dir, name!));
    // Mask off the file-type bits and compare the permission bits.
    // 0o600 = rw for owner, nothing for group/other.
    // oxlint-disable-next-line no-bitwise
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("writes events as NDJSON lines (one JSON object per line)", async () => {
    const logger = await createFileLogger(opts());
    logger.write({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "t1",
    });
    logger.write({
      ack: "AA",
      conn: 1,
      control: "c",
      ms: 3.2,
      pattern: null,
      remote: "1.2.3.4:0",
      t: "msg",
      trigger: "ADT^A01",
      ts: "t2",
    });
    await logger.close();

    const [name] = await readdir(dir);
    const events = await readAll(join(dir, name!));
    expect(events).toHaveLength(2);
    expect(events[0]?.t).toBe("ready");
    expect(events[1]?.t).toBe("msg");
  });

  it("filters out events below the configured level", async () => {
    // With level="warn", only warn / error / fatal pass. conn.open
    // (debug) and ready/msg (info) are dropped.
    const logger = await createFileLogger(opts({ level: "warn" }));
    logger.write({
      id: 1,
      remote: "1:1",
      t: "conn.open",
      ts: "t",
    }); // debug → drop
    logger.write({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "t",
    }); // info → drop
    logger.write({ message: "w", t: "warning", ts: "t" }); // warn → keep
    logger.write({ message: "e", t: "error", ts: "t" }); // error → keep
    logger.write({
      kind: "child-crashed",
      message: "f",
      t: "fatal",
      ts: "t",
    }); // fatal → keep
    await logger.close();

    const [name] = await readdir(dir);
    const events = await readAll(join(dir, name!));
    expect(events.map((e) => e.t)).toEqual(["warning", "error", "fatal"]);
  });

  it("filters `log` events by their top-level level", async () => {
    // console.log/info → level "info"; console.warn → "warn";
    // console.error → "error". With cfg.level="warn", only the last
    // two pass.
    const logger = await createFileLogger(opts({ level: "warn" }));
    logger.write({ level: "info", message: "plain", t: "log", ts: "t" });
    logger.write({ level: "warn", message: "warn", t: "log", ts: "t" });
    logger.write({ level: "error", message: "err", t: "log", ts: "t" });
    await logger.close();

    const [name] = await readdir(dir);
    const events = await readAll(join(dir, name!));
    const levels = events
      .filter((e): e is Extract<Event, { t: "log" }> => e.t === "log")
      .map((e) => e.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("rotates: keeps at most maxFiles files after a run", async () => {
    // Pre-seed the dir with 12 existing log files (different
    // timestamps via filename). Then start a new logger with
    // maxFiles=5. The startup rotation keeps the 4 most recent
    // existing files + the new one == 5 total.
    //
    // "Recent" is determined by filename sort order because the
    // timestamp prefix gives ISO-ordered names.
    for (let i = 0; i < 12; i++) {
      const name = `2026-04-17T09-${String(i).padStart(2, "0")}-00.000Z-1.ndjson`;
      await writeFile(join(dir, name), `{"t":"ready"}\n`);
    }
    const seeded = await readdir(dir);
    expect(seeded.length).toBe(12);

    const logger = await createFileLogger(opts({ maxFiles: 5 }));
    await logger.close();

    const remaining = await readdir(dir);
    const files = remaining.toSorted();
    expect(files).toHaveLength(5);
    // The kept-from-old files are the 4 newest timestamps (08..11);
    // the new logger file is the last (10-00).
    expect(files[0]).toContain("09-08");
    expect(files[1]).toContain("09-09");
    expect(files[2]).toContain("09-10");
    expect(files[3]).toContain("09-11");
    expect(files[4]).toContain("10-00");
  });

  it("ignores non-.ndjson files during rotation", async () => {
    // A stray README.md or backup file in the log dir must not be
    // touched — rotation only considers files whose names match
    // the logger's naming convention.
    await writeFile(join(dir, "README.md"), "keep me");
    await writeFile(join(dir, "2026-04-17T09-00-00.000Z-1.ndjson"), "");

    const logger = await createFileLogger(opts({ maxFiles: 1 }));
    await logger.close();

    const files = await readdir(dir);
    // README stays; old ndjson deleted (we want exactly maxFiles=1);
    // new ndjson created → 2 total in the dir.
    expect(files).toContain("README.md");
    const ndjsons = files.filter((f) => f.endsWith(".ndjson"));
    expect(ndjsons).toHaveLength(1);
    expect(ndjsons[0]).toContain("10-00");
  });

  it("refuses to write into a log dir that is a symlink (P2-5 guard)", async () => {
    // Attack scenario: on a shared host, another user plants a
    // symlink at the path glion will use for its log dir, pointing
    // to a directory they control (or one the victim shouldn't
    // write into). Without a check, mkdir({recursive:true}) silently
    // follows the symlink, rotation's unlink() resolves through it,
    // and glion ends up deleting files in the attacker's chosen dir.
    //
    // Defense: lstat the dir after mkdir; bail with a structured
    // GlionError("log-dir-unsafe") so the parent surfaces a specific
    // kind (not the generic `child-crashed`) and an actionable hint.
    const realTarget = await mkdtemp(join(tmpdir(), "glion-symlink-target-"));
    const linkedDir = join(dir, "linked-logs");
    try {
      await symlink(realTarget, linkedDir);

      let caught: unknown;
      try {
        await createFileLogger(opts({ dir: linkedDir }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(GlionError);
      const err = caught as GlionError;
      expect(err.kind).toBe("log-dir-unsafe");
      expect(err.context).toEqual({ dir: linkedDir });
      expect(err.hint).toBeDefined();
      expect(err.hint).toContain("logging.dir");

      // Nothing got written into the target directory.
      const targetContents = await readdir(realTarget);
      expect(targetContents).toHaveLength(0);
    } finally {
      await rm(realTarget, { force: true, recursive: true });
    }
  });

  it("skips symlinked log files during rotation (P2-5 belt-and-suspenders)", async () => {
    // Even with the dir-symlink guard above, an attacker who can
    // write into the log dir itself could plant a symlink with a
    // log-pattern filename. `unlink()` on a symlink only removes
    // the symlink (not its target), so the practical damage is
    // zero — but rotation has no business touching symlinks it
    // didn't create. Stat-and-skip is defense in depth and makes
    // the intent obvious to a future reader.
    const realTarget = await mkdtemp(join(tmpdir(), "glion-victim-file-"));
    const victimFile = join(realTarget, "victim.txt");
    await writeFile(victimFile, "should survive");

    try {
      // Plant a legit old log file + a symlink masquerading as one.
      await writeFile(
        join(dir, "2026-04-17T09-00-00.000Z-1.ndjson"),
        "regular"
      );
      await symlink(victimFile, join(dir, "2026-04-17T09-30-00.000Z-2.ndjson"));

      // maxFiles=1 forces rotation to delete both old entries.
      const logger = await createFileLogger(opts({ maxFiles: 1 }));
      await logger.close();

      // The victim's target file is untouched — unlink wouldn't
      // have followed the symlink anyway, but the rotation logic
      // must not remove the symlink entry either.
      const victimExists = await stat(victimFile);
      expect(victimExists.isFile()).toBe(true);

      // The symlink itself still exists in the log dir. The only
      // thing rotation is allowed to delete is its own regular log
      // files.
      const linkStat = await lstat(
        join(dir, "2026-04-17T09-30-00.000Z-2.ndjson")
      );
      expect(linkStat.isSymbolicLink()).toBe(true);

      // The regular old log file WAS deleted (rotation still works
      // on regular files).
      const dirEntries = await readdir(dir);
      expect(dirEntries).not.toContain("2026-04-17T09-00-00.000Z-1.ndjson");
    } finally {
      await rm(realTarget, { force: true, recursive: true });
    }
  });

  it("close() is idempotent — calling twice does not throw", async () => {
    const logger = await createFileLogger(opts());
    logger.write({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "t",
    });
    await logger.close();
    // Second close must resolve cleanly. Commands call close() in a
    // finally block; a double-close is a realistic scenario (signal
    // handler + normal exit both winding down).
    await expect(logger.close()).resolves.toBeUndefined();
  });

  it("write() after close() is a no-op (does not throw, does not re-open the file)", async () => {
    // Once closed, the logger drops any further writes silently. This
    // covers the case where a late-arriving event (e.g., a fatal from
    // the child during supervisor.stop()) lands after we've already
    // wound down.
    const logger = await createFileLogger(opts());
    logger.write({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "t1",
    });
    await logger.close();
    expect(() => logger.write({ t: "closed", ts: "t2" })).not.toThrow();

    const [name] = await readdir(dir);
    const events = await readAll(join(dir, name!));
    // Only the pre-close event made it to disk.
    expect(events.map((e) => e.t)).toEqual(["ready"]);
  });
});
