import type { ChildProcess, spawn as Spawn } from "node:child_process";
import { PassThrough, Readable } from "node:stream";
import { scheduler } from "node:timers/promises";

import { describe, expect, it, vi } from "vitest";

import { spawnChild } from "../../src/parent/spawn.js";

interface MinimalChild {
  stdout: Readable;
  stderr: Readable;
  pid: number;
  kill: (s?: string) => boolean;
  on: (event: string, listener: (...args: unknown[]) => void) => MinimalChild;
  fire(event: string, ...args: unknown[]): void;
}

function fakeChild(stdout: Readable, stderr?: Readable): MinimalChild {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const child: MinimalChild = {
    fire(event, ...args) {
      for (const l of listeners.get(event) ?? []) {
        l(...args);
      }
    },
    kill: vi.fn(() => true),
    on(event, listener) {
      const bucket = listeners.get(event) ?? [];
      bucket.push(listener);
      listeners.set(event, bucket);
      return this;
    },
    pid: 9999,
    stderr: stderr ?? Readable.from([]),
    stdout,
  };
  return child;
}

describe("spawnChild", () => {
  it("parses stdout JSON lines and emits Event objects via onEvent", async () => {
    const events: unknown[] = [];
    const child = fakeChild(
      Readable.from([
        `${JSON.stringify({ pid: 1, port: 2575, t: "ready", tls: false, ts: "x" })}\n`,
        `${JSON.stringify({ id: 1, remote: "1.1.1.1:1", t: "conn.open", ts: "x" })}\n`,
      ])
    );
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);

    const handle = spawnChild(
      {
        cwd: "/fake",
        manifestPath: "/fake/manifest.json",
        runnerPath: "/fake/runner.js",
      },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    handle.onEvent((e) => events.push(e));

    await scheduler.wait(10);

    expect(spawnFn).toHaveBeenCalledWith(
      process.execPath,
      ["/fake/runner.js", "/fake/manifest.json"],
      expect.objectContaining({ cwd: "/fake" })
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect((events[0] as { t: string }).t).toBe("ready");
  });

  it("handles JSON lines split across chunk boundaries", async () => {
    const stdout = new PassThrough();
    const child = fakeChild(stdout);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const events: unknown[] = [];
    const handle = spawnChild(
      { cwd: "/", manifestPath: "/c.ts", runnerPath: "/r.js" },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    handle.onEvent((e) => events.push(e));

    // Write a single JSON line in three pieces, with the newline last.
    stdout.write('{"t":"ready","port":2575,');
    stdout.write('"tls":false,"pid":1,');
    stdout.write('"ts":"x"}\n');
    await scheduler.wait(10);

    expect(events).toHaveLength(1);
    expect((events[0] as { t: string }).t).toBe("ready");
  });

  it("onEvent returns an unsubscribe function", async () => {
    const stdout = new PassThrough();
    const child = fakeChild(stdout);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const events: unknown[] = [];
    const handle = spawnChild(
      { cwd: "/", manifestPath: "/c.ts", runnerPath: "/r.js" },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    const unsub = handle.onEvent((e) => events.push(e));

    stdout.write('{"t":"ready","port":2575,"tls":false,"pid":1,"ts":"x"}\n');
    await scheduler.wait(10);
    expect(events).toHaveLength(1);

    unsub();
    stdout.write('{"t":"closing","ts":"x"}\n');
    await scheduler.wait(10);
    expect(events).toHaveLength(1);
  });

  it("resolves exited on 'close' (not 'exit') so final stdio is delivered", async () => {
    const stdout = new PassThrough();
    const child = fakeChild(stdout);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const handle = spawnChild(
      { cwd: "/", manifestPath: "/c.ts", runnerPath: "/r.js" },
      { spawn: spawnFn as unknown as typeof Spawn }
    );

    let resolved = false;
    void handle.exited.then(() => {
      resolved = true;
    });

    // `exit` alone should not resolve the promise.
    child.fire("exit", 0, null);
    await scheduler.wait(10);
    expect(resolved).toBe(false);

    // `close` completes the lifecycle.
    child.fire("close", 0, null);
    await scheduler.wait(10);
    expect(resolved).toBe(true);
  });

  it("captures a spawn 'error' event and surfaces it via exited.error", async () => {
    const child = fakeChild(new PassThrough());
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const handle = spawnChild(
      { cwd: "/", manifestPath: "/c.ts", runnerPath: "/bad.js" },
      { spawn: spawnFn as unknown as typeof Spawn }
    );

    child.fire("error", new Error("ENOENT"));
    child.fire("close", null, null);

    const info = await handle.exited;
    expect(info.error).toBeInstanceOf(Error);
    expect(info.error?.message).toBe("ENOENT");
  });

  it("kill() calls child.kill with the provided signal", () => {
    const child = fakeChild(new PassThrough());
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const handle = spawnChild(
      { cwd: "/", manifestPath: "/c.ts", runnerPath: "/r.js" },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    handle.kill("SIGTERM");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("synthesizes a warning event when a child stdout line exceeds maxLineLength", async () => {
    // Use a modest cap (100 bytes) large enough to admit a real
    // `ready` JSON event (~50 bytes) but small enough that a 500-byte
    // line clearly overflows. Keeps the test data in-process rather
    // than pushing megabytes through a pipe.
    const stdout = new PassThrough();
    const child = fakeChild(stdout);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const events: { t: string; message?: string }[] = [];
    const handle = spawnChild(
      {
        cwd: "/",
        manifestPath: "/c.ts",
        maxLineLength: 100,
        runnerPath: "/r.js",
      },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    handle.onEvent((e) => events.push(e as { t: string; message?: string }));

    // One valid event first, to prove normal flow still works.
    stdout.write(
      `${JSON.stringify({ pid: 1, port: 2575, t: "ready", tls: false, ts: "x" })}\n`
    );
    // Then a line well over the cap with no newline inside — the
    // reader must drop it and call onOverflow, which spawn.ts turns
    // into a `warning` event delivered to our listener.
    stdout.write(`${"x".repeat(500)}\n`);
    // One more valid event after recovery to confirm the reader
    // resyncs and we still receive subsequent normal events.
    stdout.write(`${JSON.stringify({ id: 1, t: "conn.close", ts: "x" })}\n`);

    await scheduler.wait(10);

    const warnings = events.filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(
      /child stdout dropped \d+ bytes \(line exceeded max length\)/
    );
    // Normal events still delivered in order.
    const normal = events.filter((e) => e.t !== "warning");
    expect(normal.map((e) => e.t)).toEqual(["ready", "conn.close"]);
  });

  it("emits a bracketed marker line on stderr when a line exceeds maxLineLength", async () => {
    const stderr = new PassThrough();
    const child = fakeChild(new PassThrough(), stderr);
    const spawnFn = vi.fn(() => child as unknown as ChildProcess);
    const stderrLines: string[] = [];
    const handle = spawnChild(
      {
        cwd: "/",
        manifestPath: "/c.ts",
        maxLineLength: 100,
        runnerPath: "/r.js",
      },
      { spawn: spawnFn as unknown as typeof Spawn }
    );
    handle.onStderrLine((line) => stderrLines.push(line));

    stderr.write("short line\n");
    stderr.write(`${"y".repeat(500)}\n`);
    stderr.write("another short line\n");

    await scheduler.wait(10);

    // Both normal lines pass through and the overflow produces a
    // single bracketed marker that the supervisor can promote to a
    // warning event. The marker slots into the list in the order it
    // occurred so downstream consumers see consistent ordering.
    expect(stderrLines).toEqual([
      "short line",
      expect.stringMatching(
        /^\[child stderr dropped \d+ bytes \(line exceeded max length\)\]$/
      ),
      "another short line",
    ]);
  });
});
