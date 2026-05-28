import { fatalEvent } from "../events.js";
import type { PartialEvent } from "../events.js";

/**
 * Process-exit signature with the bits we actually use. The real
 * `process.exit` is `(code?: number | string | null) => never`, but
 * accepting `(code: number) => void` here lets tests inject a recorder
 * that doesn't actually terminate the test runner.
 */
type Exit = (code: number) => void;

/**
 * Installs process-level handlers that convert post-startup async
 * failures into structured `fatal` events on the child's IPC stream.
 *
 * Why this exists:
 *
 * The child runner's top-level try/catch only covers errors thrown
 * synchronously from `main()`. Once `main()` resolves and the MLLP
 * server is running, any error that escapes user middleware — a
 * `setTimeout` callback that throws, a forgotten `await` on a rejecting
 * promise, a native module raising on a worker thread — bypasses that
 * try/catch entirely. Without these handlers Node prints a warning (or
 * terminates) and the parent supervisor sees the child exit without
 * any structured fatal payload, so it can't tell the user what broke.
 *
 * The runner's docstring promises "the child never silently dies — there
 * is always a machine-readable event explaining what went wrong." This
 * helper is what enforces that invariant for async failures.
 */
export function installCrashHandlers(
  // `PartialEvent` (not `Event`) to match the real emitter's signature,
  // which stamps `ts` itself. `fatalEvent()` returns a full stamped
  // Event which is assignable to PartialEvent, so both pass cleanly.
  emit: (event: PartialEvent) => void,
  exit: Exit = process.exit as Exit
): void {
  process.on("unhandledRejection", (reason) => {
    emit(fatalEvent(reason));
    exit(1);
  });
  process.on("uncaughtException", (error) => {
    emit(fatalEvent(error));
    exit(1);
  });
}
