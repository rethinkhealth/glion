import type { PartialEvent } from "../events.js";

/**
 * Minimum surface installShutdownHandlers needs from the MLLP server.
 * A structural type keeps this module decoupled from the concrete
 * `@glion/mllp/node` import so it's easy to test with a
 * plain object, and doesn't re-export an mllp type just to describe
 * lifecycle.
 */
export interface ClosableServer {
  close(): Promise<void>;
}

/**
 * Process-exit signature with only the bits we use. Real
 * `process.exit` is `(code?: number | string | null) => never`;
 * accepting `(code: number) => void` lets tests inject a recorder that
 * doesn't actually terminate the test runner.
 */
type Exit = (code: number) => void;

/**
 * Registers SIGTERM and SIGINT handlers that run a graceful shutdown
 * of the MLLP server and then exit.
 *
 * Shutdown sequence on the first signal:
 * 1. Emit `closing` so the parent TUI updates status.
 * 2. Await `server.close()` — stops accepting new connections and
 * waits for in-flight messages to drain.
 * 3. Emit `closed`, then `exit` with code 0 and the signal name.
 * 4. Call exit(0).
 *
 * The `shuttingDown` flag is a latch, not a counter: once the first
 * signal has started the sequence, additional SIGTERM/SIGINT deliveries
 * are silently ignored so a burst of `kill` + `kill` or `SIGTERM + Ctrl-C`
 * cannot double-close the server.
 *
 * If `server.close()` rejects (stuck connection, socket error), we
 * emit an `error` event, still fire `closed` + `exit` so downstream
 * consumers that track the full lifecycle triplet see a complete
 * stream (aggregators, dashboards keying on "every closing has a
 * terminator"), and exit 1. The exit event carries code=1 and the
 * signal name so operators can correlate with what they sent.
 */
export function installShutdownHandlers(
  server: ClosableServer,
  // `PartialEvent` (not `Event`) because the real emitter stamps `ts`
  // itself — the caller here passes unstamped events so this signature
  // has to allow that.
  emit: (event: PartialEvent) => void,
  exit: Exit = process.exit as Exit
): void {
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    emit({ t: "closing" });
    // `closed` + `exit` are terminators that ALWAYS fire once we've
    // started shutting down — success or failure — so downstream
    // consumers see a complete lifecycle triplet. The error event
    // slots into the catch so it appears between `closing` and
    // `closed` when close() rejects.
    let code = 0;
    try {
      await server.close();
    } catch (error) {
      emit({
        message: error instanceof Error ? error.message : String(error),
        t: "error",
      });
      code = 1;
    } finally {
      emit({ t: "closed" });
      emit({ code, signal, t: "exit" });
      exit(code);
    }
  };
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}
