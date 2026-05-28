import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConsoleModule from "../../src/child/console.js";
import type * as CrashHandlersModule from "../../src/child/crash-handlers.js";
import type * as EmitterModule from "../../src/child/emitter.js";

// Spy + no-op the three module-load side effects that would otherwise
// be unsafe to run inside the test process. The whole point of this
// file is to assert the runner WIRES UP these helpers — not to
// re-test what each helper does (those have their own tests).
const installCrashHandlersSpy = vi.fn();
const installConsoleCaptureSpy = vi.fn();
const fakeEmit = vi.fn();
const createEmitterSpy = vi.fn(() => fakeEmit);

vi.mock(import("../../src/child/crash-handlers.js"), () => ({
  installCrashHandlers:
    installCrashHandlersSpy as unknown as typeof CrashHandlersModule.installCrashHandlers,
}));
vi.mock(import("../../src/child/console.js"), () => ({
  installConsoleCapture:
    installConsoleCaptureSpy as unknown as typeof ConsoleModule.installConsoleCapture,
}));
vi.mock(import("../../src/child/emitter.js"), () => ({
  createEmitter:
    createEmitterSpy as unknown as typeof EmitterModule.createEmitter,
}));

// Capture process.exit so the runner's own try/catch (which calls
// process.exit(1) when main() throws — and main() WILL throw because
// we don't pass a manifest path) doesn't terminate the test runner.
// Use vi.fn so we can read `invocationCallOrder` and assert ordering
// against the other spies.
let savedExit: typeof process.exit;
let savedKill: typeof process.kill;
const exitSpy = vi.fn<(code?: number | string | null) => never>();
const killSpy = vi.fn<(pid: number, signal?: string | number) => true>(
  () => true
);

beforeEach(() => {
  installCrashHandlersSpy.mockClear();
  installConsoleCaptureSpy.mockClear();
  createEmitterSpy.mockClear();
  fakeEmit.mockClear();
  exitSpy.mockClear();
  killSpy.mockClear();
  savedExit = process.exit;
  savedKill = process.kill;
  process.exit = exitSpy as typeof process.exit;
  process.kill = killSpy as unknown as typeof process.kill;
  vi.resetModules();
});

afterEach(() => {
  process.exit = savedExit;
  process.kill = savedKill;
  process.stdin.removeAllListeners("end");
});

describe("runner module wiring", () => {
  it("calls installCrashHandlers with the emit function at module load", async () => {
    // Importing the runner module executes its top-level code:
    //   - createEmitter(process.stdout)
    //   - installConsoleCapture(emit)
    //   - installCrashHandlers(emit)   ← THE WIRING WE GUARD HERE
    //   - process.stdin.resume() / .on("end")
    //   - main() (throws because no manifest path → caught → exit(1))
    //
    // If a future refactor deletes the installCrashHandlers call from
    // runner.ts, this assertion fails — the helper would still exist
    // and its own tests would still pass, but the child would silently
    // lose its crash-to-fatal-event pipeline.
    await import("../../src/child/runner.js");

    expect(createEmitterSpy).toHaveBeenCalledOnce();
    expect(installCrashHandlersSpy).toHaveBeenCalledOnce();
    expect(installCrashHandlersSpy).toHaveBeenCalledWith(fakeEmit);
  });

  it("installs crash handlers BEFORE main() can exit", async () => {
    // Order matters: a startup-phase crash (e.g. the entry module
    // throws on import) must also be caught by the crash handlers,
    // so the call has to appear before main() runs. main() in this
    // test setup always throws (no manifest path) and the bottom-of-
    // file catch fires `process.exit(1)` — if the crash-handlers
    // install happened AFTER that exit, handlers would be registered
    // against a dead process.
    //
    // Vitest's vi.fn tracks a global monotonic `invocationCallOrder`
    // across all spies, so we can assert the install call strictly
    // preceded the exit call instead of just "was called at some
    // point".
    await import("../../src/child/runner.js");

    // `invocationCallOrder` elements are typed as `number | undefined`
    // because the array might be empty. Assert each was actually
    // called first (non-zero length narrows the type as a side
    // effect) before comparing.
    expect(installCrashHandlersSpy.mock.invocationCallOrder.length).toBe(1);
    expect(exitSpy.mock.invocationCallOrder.length).toBe(1);
    const installOrder =
      installCrashHandlersSpy.mock.invocationCallOrder[0] ?? 0;
    const exitOrder = exitSpy.mock.invocationCallOrder[0] ?? 0;

    expect(installOrder).toBeGreaterThan(0);
    expect(exitOrder).toBeGreaterThan(installOrder);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("self-signals SIGTERM on stdin 'end' rather than calling process.exit directly", async () => {
    // Orphan detection: when the parent's stdin pipe closes (parent
    // crashed / was killed), the child must shut down. Previously
    // this called process.exit(1) directly — skipping any in-flight
    // MLLP drain and emitting no lifecycle events, so senders saw
    // torn connections and retried messages.
    //
    // Fixed behavior: self-signal SIGTERM. If installShutdownHandlers
    // has already registered (server is up), the graceful path fires
    // — closing → closed → exit(0). If shutdown handlers aren't up
    // yet (pre-server orphan during startup), Node's default SIGTERM
    // behavior terminates the child, same net effect as the old
    // process.exit(1) but with proper signal semantics.
    await import("../../src/child/runner.js");

    // main() in this test setup throws and calls process.exit(1)
    // via the bottom-of-file catch. Clear that invocation so we can
    // assert cleanly what stdin-end does separately.
    killSpy.mockClear();

    // Simulate the parent's pipe closing.
    process.stdin.emit("end");

    expect(killSpy).toHaveBeenCalledOnce();
    expect(killSpy).toHaveBeenCalledWith(process.pid, "SIGTERM");
  });
});
