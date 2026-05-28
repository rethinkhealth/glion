import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Event } from "../../src/events.js";
import type * as SupervisorModule from "../../src/parent/supervisor.js";

type EventListener = (event: Event) => void;
type ExitListener = (code: number | null, signal: string | null) => void;

// Module-scoped queue of events the fake supervisor emits before
// firing onExit. Tests push into this array before calling runStart;
// the fake drains it on start(). Keeping the queue at module scope
// (not inside the factory) is the simplest way to parameterize a
// single file-scoped ESM mock across tests.
const eventsToEmit: Event[] = [];
let throwOnStart = false;

vi.mock(import("../../src/parent/supervisor.js"), () => {
  const FakeSupervisor = function FakeSupervisor(
    this: Record<string, unknown>
  ) {
    const eventListeners: EventListener[] = [];
    const exitListeners: ExitListener[] = [];
    this.onEvent = (fn: EventListener) => {
      eventListeners.push(fn);
      return () => {
        const i = eventListeners.indexOf(fn);
        if (i !== -1) {
          eventListeners.splice(i, 1);
        }
      };
    };
    this.onExit = (fn: ExitListener) => {
      exitListeners.push(fn);
      return () => {
        // no-op
      };
    };
    this.start = () => {
      if (throwOnStart) {
        throw new Error("synthetic startup failure");
      }
      // Flush the queued events synchronously so subscribers see
      // them BEFORE onExit fires. This matches real supervisor
      // behavior: events flow, then the child exits.
      queueMicrotask(() => {
        for (const event of eventsToEmit) {
          for (const listener of eventListeners) {
            listener(event);
          }
        }
        for (const listener of exitListeners) {
          listener(0, null);
        }
      });
    };
    this.stop = () => Promise.resolve();
  } as unknown as typeof SupervisorModule.GlionSupervisor;
  return { GlionSupervisor: FakeSupervisor };
});

const { runStart } = await import("../../src/commands/start.js");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-start-filelogger-"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "app.ts"), "export default {};");
  eventsToEmit.length = 0;
  throwOnStart = false;
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

/**
 * Writes a minimal glion.config.ts with the given logging expression.
 * Passing `undefined` omits the field entirely (exercises the default).
 *
 * `hostname: "127.0.0.1"` is explicit so the file-logger tests don't
 * pick up the open-network warning that runStart emits for the
 * default 0.0.0.0 binding. That warning has its own tests in
 * start.test.ts.
 */
async function writeConfig(loggingExpr?: string): Promise<void> {
  const loggingLine =
    loggingExpr === undefined ? "" : `, logging: ${loggingExpr}`;
  await writeFile(
    join(dir, "glion.config.ts"),
    `export default { entry: "./src/app.ts", port: 0, hostname: "127.0.0.1"${loggingLine} };`
  );
}

function drainedStreams(): { stdout: PassThrough; stderr: PassThrough } {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.resume();
  stderr.resume();
  return { stderr, stdout };
}

/**
 * Reads every .ndjson file in the log dir and parses its lines.
 * Throws if the dir doesn't exist — callers use this in tests where
 * logging is known to be enabled.
 */
async function readAllLogFiles(logDir: string): Promise<Event[][]> {
  const entries = await readdir(logDir);
  const ndjsons = entries.filter((f) => f.endsWith(".ndjson"));
  return Promise.all(
    ndjsons.map(async (f) => {
      const text = await readFile(join(logDir, f), "utf8");
      return text
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Event);
    })
  );
}

describe("runStart — file logger lifecycle", () => {
  it("with logging enabled: creates the file, writes events, and fully flushes on shutdown", async () => {
    // This is the structural "close actually runs" test. If `finally`
    // didn't await logger.close(), the file would either be missing
    // events (close didn't flush) or show a truncated last line
    // (stream ended mid-write). Reading back every emitted event is
    // the end-to-end proof that close + finished(stream) both ran.
    await writeConfig("true");
    eventsToEmit.push(
      {
        hostname: "127.0.0.1",
        pid: 1,
        port: 2575,
        t: "ready",
        tls: false,
        ts: "2026-04-17T10:00:00.000Z",
      },
      {
        message: "hello",
        t: "warning",
        ts: "2026-04-17T10:00:01.000Z",
      }
    );

    const { stdout, stderr } = drainedStreams();
    const code = await runStart({ cwd: dir, stderr, stdout });
    expect(code).toBe(0);

    const logDir = join(dir, ".glion", "logs");
    const [events] = await readAllLogFiles(logDir);
    expect(events).toBeDefined();
    // All emitted events landed — proves write() was subscribed AND
    // close() flushed before runStart returned.
    expect(events?.map((e) => e.t)).toEqual(["ready", "warning"]);
  });

  it("with logging disabled (default): does not create the log directory", async () => {
    // Default is enabled: false. No createFileLogger side effects
    // — no mkdir, no stream, no announcement. Regression guard for
    // the PHI-safety contract: a user who doesn't opt in must not
    // find `.glion/logs/` sitting in their cwd.
    await writeConfig(); // no `logging` field
    eventsToEmit.push({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "2026-04-17T10:00:00.000Z",
    });

    const { stdout, stderr } = drainedStreams();
    await runStart({ cwd: dir, stderr, stdout });

    const logDir = join(dir, ".glion", "logs");
    await expect(stat(logDir)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("announces the log path on stderr exactly once when logging is enabled", async () => {
    // The operator needs a single, visible notification that glion
    // is writing a file — silent filesystem side effects are the
    // thing we're explicitly trying to avoid. One announcement,
    // not one per event, not zero.
    await writeConfig("true");

    const stdout = new PassThrough();
    const stderrChunks: string[] = [];
    const stderr = new PassThrough();
    stdout.resume();
    stderr.on("data", (c: Buffer) => stderrChunks.push(c.toString()));

    await runStart({ cwd: dir, stderr, stdout });

    const stderrText = stderrChunks.join("");
    const matches = stderrText.match(/glion: writing logs to /g) ?? [];
    expect(matches).toHaveLength(1);
    expect(stderrText).toContain(join(dir, ".glion", "logs"));
  });

  it("flushes the log file even when supervisor.start() throws synchronously", async () => {
    // The risky window: logger is created, then something AFTER
    // it throws. The finally block must still close + flush. We
    // force this by making the fake supervisor's start() throw.
    // Any events that already reached the subscribe would be in
    // the file; at minimum the file must exist and be readable
    // (no stream lock, no partial write).
    await writeConfig("true");
    throwOnStart = true;

    const { stdout, stderr } = drainedStreams();
    const code = await runStart({ cwd: dir, stderr, stdout });
    // runStart catches the throw and returns 1 via the fatal-event path.
    expect(code).toBe(1);

    const logDir = join(dir, ".glion", "logs");
    // The log dir and file must exist — createFileLogger ran.
    const entries = await readdir(logDir);
    const ndjsons = entries.filter((f) => f.endsWith(".ndjson"));
    expect(ndjsons).toHaveLength(1);
    // File must be readable (close completed; stream not locked).
    const text = await readFile(join(logDir, ndjsons[0]!), "utf8");
    // It's fine if there are zero lines (the throw happened before
    // any event was emitted) — the guarantee is that it's parseable.
    for (const line of text.split("\n").filter((l) => l.length > 0)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("does not accumulate log files beyond maxFiles across repeated invocations", async () => {
    // Structural proof that open/close is balanced across runs: if
    // close() wasn't flushing OR if files were being left open, one
    // of these would break in ways a reader can observe — either
    // rotation wouldn't delete old files (because they'd be locked
    // on Windows, or because stat() would fail) or maxFiles wouldn't
    // hold.
    await writeConfig("{ maxFiles: 3 }");
    eventsToEmit.push({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "2026-04-17T10:00:00.000Z",
    });

    const logDir = join(dir, ".glion", "logs");
    for (let i = 0; i < 5; i += 1) {
      const { stdout, stderr } = drainedStreams();
      await runStart({ cwd: dir, stderr, stdout });
    }

    const entries = await readdir(logDir);
    const ndjsons = entries.filter((f) => f.endsWith(".ndjson"));
    // Five runs, maxFiles=3 → rotation keeps exactly 3.
    expect(ndjsons).toHaveLength(3);
  });
});
