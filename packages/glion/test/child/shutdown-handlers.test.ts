import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installShutdownHandlers } from "../../src/child/shutdown-handlers.js";
import type { PartialEvent } from "../../src/events.js";

// Same snapshot/restore pattern as crash-handlers.test.ts: we remove
// existing SIGTERM/SIGINT listeners for the duration of each test so
// invoking our captured handlers doesn't also fire vitest's own.
type Listener = (...args: unknown[]) => void;
let savedTerm: Listener[] = [];
let savedInt: Listener[] = [];

beforeEach(() => {
  savedTerm = process.listeners("SIGTERM") as Listener[];
  savedInt = process.listeners("SIGINT") as Listener[];
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
});

afterEach(() => {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  for (const fn of savedTerm) {
    process.on("SIGTERM", fn);
  }
  for (const fn of savedInt) {
    process.on("SIGINT", fn);
  }
});

/**
 * Minimal deferred helper so tests can resolve/reject `server.close()`
 * at a precise moment and assert what's already happened before vs.
 * after.
 *
 * Typed as `Deferred<T = undefined>` — never `Deferred<void>` — because
 * `no-invalid-void-type` rejects `void` as a generic argument. The
 * conditional `Resolve<T>` lets `deferred()` (T defaults to undefined)
 * be called as `resolve()` while any `deferred<SomethingElse>()` still
 * requires the value argument.
 */
type Resolve<T> = [T] extends [undefined]
  ? (value?: T) => void
  : (value: T) => void;
interface Deferred<T> {
  promise: Promise<T>;
  resolve: Resolve<T>;
  reject: (reason: unknown) => void;
}
function deferred<T = undefined>(): Deferred<T> {
  let outerResolve!: Resolve<T>;
  let outerReject!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new
  const promise = new Promise<T>((resolve, reject) => {
    outerResolve = resolve as Resolve<T>;
    outerReject = reject;
  });
  return { promise, reject: outerReject, resolve: outerResolve };
}

/** Gets the most-recently-added listener for a signal. */
function grabLatestListener(signal: "SIGTERM" | "SIGINT"): Listener {
  const listeners = process.listeners(signal) as Listener[];
  const last = listeners.at(-1);
  if (!last) {
    throw new Error(`No listener registered for ${signal}`);
  }
  return last;
}

describe("installShutdownHandlers", () => {
  it("registers exactly one listener on SIGTERM and one on SIGINT", () => {
    const closeDeferred = deferred();
    const server = { close: () => closeDeferred.promise };

    installShutdownHandlers(
      server,
      () => {
        // no events expected from this test
      },
      () => {
        // no exit expected from this test
      }
    );

    expect(process.listenerCount("SIGTERM")).toBe(1);
    expect(process.listenerCount("SIGINT")).toBe(1);
  });

  it("emits closing → closed → exit and exits 0 on clean SIGTERM shutdown", async () => {
    const events: PartialEvent[] = [];
    const exitCodes: number[] = [];
    const closeDeferred = deferred();
    const server = { close: () => closeDeferred.promise };

    installShutdownHandlers(
      server,
      (event) => {
        events.push(event);
      },
      (code) => {
        exitCodes.push(code);
      }
    );

    // Invoke the SIGTERM handler directly (more deterministic than
    // emitting a signal, and doesn't risk interfering with vitest).
    grabLatestListener("SIGTERM")();

    // `closing` is emitted synchronously before server.close() is awaited.
    expect(events).toEqual([{ t: "closing" }]);
    expect(exitCodes).toEqual([]);

    // Resolve the close; let the microtask queue drain so the rest of
    // the shutdown sequence runs.
    closeDeferred.resolve();
    await closeDeferred.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual([
      { t: "closing" },
      { t: "closed" },
      { code: 0, signal: "SIGTERM", t: "exit" },
    ]);
    expect(exitCodes).toEqual([0]);
  });

  it("propagates the SIGINT signal name into the exit event", async () => {
    const events: PartialEvent[] = [];
    const closeDeferred = deferred();
    const server = { close: () => closeDeferred.promise };

    installShutdownHandlers(
      server,
      (event) => {
        events.push(event);
      },
      () => {
        // ignore exit
      }
    );

    grabLatestListener("SIGINT")();
    closeDeferred.resolve();
    await closeDeferred.promise;
    await Promise.resolve();
    await Promise.resolve();

    const exitEvent = events.find((e) => e.t === "exit");
    expect(exitEvent).toMatchObject({ code: 0, signal: "SIGINT" });
  });

  it("silently ignores a second signal while shutdown is in flight", () => {
    const events: PartialEvent[] = [];
    const exitCodes: number[] = [];
    const closeFn = vi.fn(() => deferred().promise);
    const server = { close: closeFn };

    installShutdownHandlers(
      server,
      (event) => {
        events.push(event);
      },
      (code) => {
        exitCodes.push(code);
      }
    );

    // First signal starts shutdown.
    grabLatestListener("SIGTERM")();
    expect(events).toEqual([{ t: "closing" }]);
    expect(closeFn).toHaveBeenCalledOnce();

    // Second signal of the SAME kind: shuttingDown guard ignores it.
    grabLatestListener("SIGTERM")();
    // Third signal of the OTHER kind: same guard.
    grabLatestListener("SIGINT")();

    // The close function should still have been called only once, and
    // no additional `closing` events should have been emitted.
    expect(closeFn).toHaveBeenCalledOnce();
    expect(events.filter((e) => e.t === "closing")).toHaveLength(1);
    expect(exitCodes).toEqual([]);
  });

  it("emits a full lifecycle (closing → error → closed → exit) when server.close() rejects", async () => {
    // When server.close() rejects, downstream consumers that track
    // the full lifecycle triplet (closing → closed → exit) previously
    // saw a truncated stream: just `closing` and `error`. That broke
    // any aggregator or dashboard that keyed on "every closing has a
    // closed terminator."
    //
    // Fixed behavior: the error event slots between closing and the
    // normal closed/exit pair, so the triplet is preserved. Code on
    // the exit event becomes 1 (close failed) but the signal name is
    // preserved so operators can still correlate with what they sent.
    const events: PartialEvent[] = [];
    const exitCodes: number[] = [];
    const closeDeferred = deferred();
    const server = { close: () => closeDeferred.promise };

    installShutdownHandlers(
      server,
      (event) => {
        events.push(event);
      },
      (code) => {
        exitCodes.push(code);
      }
    );

    grabLatestListener("SIGTERM")();
    closeDeferred.reject(new Error("port stuck"));
    // Let the rejection propagate.
    await closeDeferred.promise.catch(() => {
      // expected
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual([
      { t: "closing" },
      { message: "port stuck", t: "error" },
      { t: "closed" },
      { code: 1, signal: "SIGTERM", t: "exit" },
    ]);
    expect(exitCodes).toEqual([1]);
  });
});
