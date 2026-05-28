import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installCrashHandlers } from "../../src/child/crash-handlers.js";
import type { PartialEvent } from "../../src/events.js";

// We have to take over the process-level handlers for the duration of
// each test, because emitting `unhandledRejection` / `uncaughtException`
// onto the live process would also fire vitest's own listeners (and in
// the case of `uncaughtException`, terminate the test runner). The
// before/after hooks snapshot the existing listeners, remove them so
// only ours fires, then restore them.
type Listener = (...args: unknown[]) => void;
let savedRejection: Listener[] = [];
let savedException: Listener[] = [];

beforeEach(() => {
  savedRejection = process.listeners("unhandledRejection") as Listener[];
  savedException = process.listeners("uncaughtException") as Listener[];
  process.removeAllListeners("unhandledRejection");
  process.removeAllListeners("uncaughtException");
});

afterEach(() => {
  process.removeAllListeners("unhandledRejection");
  process.removeAllListeners("uncaughtException");
  for (const fn of savedRejection) {
    process.on("unhandledRejection", fn);
  }
  for (const fn of savedException) {
    process.on("uncaughtException", fn);
  }
});

describe("installCrashHandlers", () => {
  it("emits a fatal event and signals exit on unhandledRejection", () => {
    const events: PartialEvent[] = [];
    let exitCode: number | null = null;

    installCrashHandlers(
      (event) => {
        events.push(event);
      },
      (code) => {
        exitCode = code;
      }
    );

    // Simulate an unhandled rejection inside user code.
    process.emit(
      "unhandledRejection",
      new Error("rejected from a timer"),
      Promise.resolve()
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      message: "rejected from a timer",
      t: "fatal",
    });
    expect(exitCode).toBe(1);
  });

  it("emits a fatal event and signals exit on uncaughtException", () => {
    const events: PartialEvent[] = [];
    let exitCode: number | null = null;

    installCrashHandlers(
      (event) => {
        events.push(event);
      },
      (code) => {
        exitCode = code;
      }
    );

    process.emit("uncaughtException", new Error("uncaught from a callback"));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      message: "uncaught from a callback",
      t: "fatal",
    });
    expect(exitCode).toBe(1);
  });

  it("converts a non-Error rejection reason into a fatal event", () => {
    const events: PartialEvent[] = [];

    installCrashHandlers(
      (event) => {
        events.push(event);
      },
      () => {
        // ignore exit
      }
    );

    // Reject with a string — common in user code that does
    // `Promise.reject("oops")`.
    process.emit("unhandledRejection", "oops", Promise.resolve());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ message: "oops", t: "fatal" });
  });
});
