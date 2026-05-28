import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SupervisorModule from "../../src/parent/supervisor.js";

type ExitListener = (code: number | null, signal: string | null) => void;

// Replace GlionSupervisor with a lightweight fake. runStart does three
// real things we want to exercise (ensureCacheDir, loadConfig,
// prepareChild), and one heavyweight thing we don't want to exercise
// (spawning a child Node process). Mocking at the supervisor boundary
// keeps this test in-process while still driving runStart through the
// full success path, including the signal-handler registration we're
// testing.
//
// The cast is needed because the fake intentionally implements only the
// handful of methods runStart touches; the real class has many private
// fields we don't care about for this test.
vi.mock(import("../../src/parent/supervisor.js"), () => {
  // Closure-based fake (not a class) so linter rules about unused
  // `this` in methods don't apply. Each invocation gets its own
  // exitListeners array via the factory closure.
  const FakeSupervisor = function FakeSupervisor(
    this: Record<string, unknown>
  ) {
    const exitListeners: ExitListener[] = [];
    this.onEvent = () => () => {
      // no-op
    };
    this.onExit = (fn: ExitListener) => {
      exitListeners.push(fn);
      return () => {
        // no-op
      };
    };
    this.start = () => {
      // Simulate a child that fails to start. Firing onExit with
      // code=1 unblocks runStart's `await exited` and returns 1 —
      // the same return path a real startup crash would take.
      queueMicrotask(() => {
        for (const listener of exitListeners) {
          listener(1, null);
        }
      });
    };
    this.stop = () => Promise.resolve();
  } as unknown as typeof SupervisorModule.GlionSupervisor;
  return { GlionSupervisor: FakeSupervisor };
});

// Import AFTER vi.mock — ESM hoisting makes the mock visible.
const { runStart } = await import("../../src/commands/start.js");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-start-test-"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, "src", "app.ts"), "export default {};");
  await writeFile(
    join(dir, "glion.config.ts"),
    `export default { entry: "./src/app.ts", port: 0 };`
  );
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("runStart — process-listener lifecycle", () => {
  it("removes SIGINT and SIGTERM listeners after it returns", async () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");

    // Drain stdout/stderr so the mocked supervisor's (absent) output
    // doesn't pool in memory and so runStart's stdout.write calls
    // don't crash on the PassThrough back-pressure edge.
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.resume();
    stderr.resume();

    const exitCode = await runStart({ cwd: dir, stderr, stdout });

    // The mocked supervisor fires onExit with code=1 so runStart's
    // computeExitCode returns 1. We don't care about the exact number
    // — only that runStart returned so we can inspect the process.
    expect(exitCode).toBe(1);

    // THE POINT OF THIS TEST: runStart must clean up its signal
    // handlers on every exit path. If it doesn't, the counts are
    // two higher than the baseline and every subsequent runStart
    // invocation in the same process accumulates another two
    // stale closures.
    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });

  it("does not accumulate listeners across repeated invocations", async () => {
    const sigintBefore = process.listenerCount("SIGINT");
    const sigtermBefore = process.listenerCount("SIGTERM");

    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.resume();
    stderr.resume();

    // Three back-to-back invocations. Without cleanup this leaks 6
    // listeners; with cleanup it leaks 0.
    await runStart({ cwd: dir, stderr, stdout });
    await runStart({ cwd: dir, stderr, stdout });
    await runStart({ cwd: dir, stderr, stdout });

    expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
    expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
  });

  it("does not touch process listeners when it throws before registering them", async () => {
    // The `handleSignal` variable is hoisted to the top of runStart
    // and starts as undefined. If loadConfig / prepareChild / etc.
    // throws before the `process.on(...)` calls reach it, the finally
    // block's `if (handleSignal)` guard must skip cleanup — otherwise
    // we'd call `process.off(sig, undefined)` which would either
    // throw or silently break the listener table.
    //
    // Force that path by pointing runStart at a directory with no
    // glion config at all. `loadConfig` throws `config-not-found`
    // before any signal handler is registered.
    const emptyDir = await mkdtemp(join(tmpdir(), "glion-start-empty-"));
    try {
      const sigintBefore = process.listenerCount("SIGINT");
      const sigtermBefore = process.listenerCount("SIGTERM");

      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.resume();
      stderr.resume();

      const exitCode = await runStart({ cwd: emptyDir, stderr, stdout });

      // The catch block returned 1 — verifies we actually took the
      // error path, not a silent success.
      expect(exitCode).toBe(1);
      // Listener counts must match baseline exactly, proving the
      // guard in the finally block kept process.off from running
      // against an undefined handler.
      expect(process.listenerCount("SIGINT")).toBe(sigintBefore);
      expect(process.listenerCount("SIGTERM")).toBe(sigtermBefore);
    } finally {
      await rm(emptyDir, { force: true, recursive: true });
    }
  });
});

/**
 * Captures every chunk a PassThrough writes into a string[]. Tests
 * use the joined value to assert the emitted JSON-line stream.
 */
function capturingStream(): {
  stream: PassThrough;
  chunks: string[];
  text: () => string;
} {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c.toString()));
  return { chunks, stream, text: () => chunks.join("") };
}

describe("runStart — open-network binding warning", () => {
  it("emits a warning event when hostname is 0.0.0.0 without TLS", async () => {
    // `glion start` defaults hostname to 0.0.0.0 (binds all
    // interfaces, matching typical behind-a-firewall production
    // topologies). Without TLS, HL7v2 traffic on that listener is
    // unauthenticated cleartext. Operators routinely don't realize
    // the default binds externally; surface the posture as a
    // structured warning so aggregators and dashboards see it.
    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    // Find the warning line among the NDJSON output.
    const lines = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0);
    const warnings = lines
      .map((l) => JSON.parse(l) as { t: string; message?: string })
      .filter((e) => e.t === "warning" && e.message?.includes("0.0.0.0"));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("TLS");
  });

  it("does not emit the warning when hostname is 127.0.0.1", async () => {
    // Explicit loopback means the operator is intentionally limiting
    // exposure — no warning needed.
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 0, hostname: "127.0.0.1" };`
    );

    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    const lines = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0);
    const warnings = lines
      .map((l) => JSON.parse(l) as { t: string; message?: string })
      .filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(0);
  });

  // Loopback vs non-loopback is the real distinction — not the
  // literal "0.0.0.0". These tests cover the IPv6 and explicit-LAN
  // cases the original literal-only check missed.

  it("does not emit the warning for IPv6 loopback (::1)", async () => {
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 0, hostname: "::1" };`
    );

    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    const warnings = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((l) => JSON.parse(l) as { t: string })
      .filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(0);
  });

  it("emits the warning for IPv6 all-interfaces (::)", async () => {
    // `::` is the IPv6 equivalent of `0.0.0.0` — binding to it on a
    // dual-stack host exposes on every interface including public.
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 0, hostname: "::" };`
    );

    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    const warnings = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((l) => JSON.parse(l) as { t: string; message?: string })
      .filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("::");
    expect(warnings[0]?.message).toContain("TLS");
  });

  it("emits the warning for an explicit LAN IP", async () => {
    // Binding to a specific non-loopback address is ALSO exposure —
    // operators relying on a "trusted LAN" still get the notice.
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 0, hostname: "192.168.1.50" };`
    );

    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    const warnings = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((l) => JSON.parse(l) as { t: string; message?: string })
      .filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toContain("192.168.1.50");
  });

  it("does not emit the warning when hostname is the string 'localhost'", async () => {
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 0, hostname: "localhost" };`
    );

    const stdout = capturingStream();
    const stderr = new PassThrough();
    stderr.resume();

    await runStart({ cwd: dir, stderr, stdout: stdout.stream });

    const warnings = stdout
      .text()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((l) => JSON.parse(l) as { t: string })
      .filter((e) => e.t === "warning");
    expect(warnings).toHaveLength(0);
  });
});
