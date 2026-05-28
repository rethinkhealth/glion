/**
 * Child process entry point for `glion dev` and `glion start`.
 *
 * ## How it's invoked
 *
 * The parent supervisor spawns this script as a subprocess:
 *
 *     process.execPath  dist/child/runner.js  .glion/manifest.json
 *           │                   │                     │
 *           ▼                   ▼                     ▼
 *       Node/Bun/Deno      this file         sole input argument
 *
 * The manifest JSON (written by the parent's `prepareChild()`)
 * contains everything the child needs: compiled entry path, port,
 * hostname, TLS paths, and socket options. The child never discovers
 * or compiles anything — it trusts the parent's pre-built output.
 *
 * ## Communication model
 *
 *     child stdout ──→ parent (structured JSON events, one per line)
 *     child stderr ──→ parent (raw text, surfaced as warning events)
 *     parent ──────X── child (no reverse channel)
 *
 * All communication is one-directional: child → parent via stdout.
 * The parent controls the child's lifecycle through OS signals
 * (SIGTERM for graceful shutdown, SIGKILL as escalation).
 *
 * ## Lifecycle
 *
 *     1. Read manifest JSON from argv[2]
 *     2. Import the pre-built entry module → Mllp instance
 *     3. Install the msg event middleware (telemetry)
 *     4. Start the MLLP server (TCP bind)
 *     5. Emit "ready" event with the actual bound port
 *     6. Install SIGTERM/SIGINT shutdown handlers
 *     7. Serve until signaled to stop
 *
 * ## Error strategy
 *
 * Every error is caught and converted to a structured `fatal` event
 * via `fatalEvent()` before exit. The parent's supervisor classifies
 * the exit and decides whether to respawn (dev) or propagate (start).
 * The child never silently dies — there is always a machine-readable
 * event explaining what went wrong.
 *
 * Never imported by other source files; directly executed as a script.
 */

import { readFile } from "node:fs/promises";

import type { ConnectionInfo, MessageInfo } from "@glion/mllp";
import { serve } from "@glion/mllp/node";
import type { Server } from "@glion/mllp/node";

import { GlionError } from "../errors.js";
import { fatalEvent } from "../events.js";
import type { ChildManifest } from "../types.js";
import { installConsoleCapture } from "./console.js";
import { installCrashHandlers } from "./crash-handlers.js";
import { createEmitter } from "./emitter.js";
import { loadEntry } from "./load-entry.js";
import { createMsgTelemetry } from "./middlewares.js";
import { installShutdownHandlers } from "./shutdown-handlers.js";
import { readTlsFile } from "./tls.js";

// ── Emitter ──────────────────────────────────────────────────────
// Created once at module scope. Every function in this file calls
// emit() to send structured events to the parent via stdout.
const emit = createEmitter(process.stdout);

// ── Console capture ──────────────────────────────────────────────
// Intercept console.log/info/warn/error BEFORE loading user code so
// all output becomes structured log events instead of raw text that
// would corrupt the JSON event stream.
installConsoleCapture(emit);

// ── Crash handlers ───────────────────────────────────────────────
// The bottom-of-file try/catch only covers errors thrown synchronously
// from main(). Once the MLLP server is up, an unhandled rejection or
// uncaught exception (timer callback, forgotten await in user
// middleware, native addon panic) would otherwise terminate the child
// without emitting anything — the parent would see only a bare exit.
// These handlers funnel post-startup failures through fatalEvent() so
// the parent always gets a structured explanation.
installCrashHandlers(emit);

// ── Orphan detection ─────────────────────────────────────────────
// The parent pipes stdin to the child. If the parent crashes or is
// killed, the pipe closes and stdin emits "end". Self-signal SIGTERM
// so the existing shutdown handler (once installShutdownHandlers
// registers it later in main()) runs the graceful drain — closing
// → closed → exit(0) — instead of abruptly terminating mid-message.
//
// If stdin ends before main() gets to installShutdownHandlers (the
// pre-server startup window), Node's default SIGTERM behavior
// terminates the child immediately. Same net effect as the old
// process.exit(1) but via a proper signal path.
process.stdin.resume();
process.stdin.on("end", () => {
  process.kill(process.pid, "SIGTERM");
});

// ── Main ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Step 1: Read the manifest — the child's sole input.
  // The parent wrote this JSON to .glion/manifest.json containing
  // the compiled entry path and all server configuration.
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    throw new GlionError(
      "config-not-found",
      "Child runner invoked without a manifest path argument."
    );
  }

  const manifest: ChildManifest = JSON.parse(
    await readFile(manifestPath, "utf8")
  );

  // Step 2: Import the pre-built entry module.
  // The parent compiled the user's glion.app.ts (and its local
  // imports) into a single .js file via rolldown build(). We load
  // it with native import() — no jiti, no runtime TS compilation.
  const app = await loadEntry(manifest.compiledEntry);

  // Step 3: Install the telemetry middleware.
  // This wraps every MLLP message handler to emit a "msg" event
  // with timing, trigger, control ID, and ACK code. Prepended so it
  // sits outermost — its `await next()` completes after all user
  // middleware (including ackMiddleware) have run, ensuring any
  // other middleware is injected before.
  app.use(createMsgTelemetry(emit), { prepend: true });

  // Step 4: Read TLS certificates (if configured).
  // Paths are absolute (resolved by the parent's config loader).
  // Errors here produce a clear "tls-read-failed" GlionError with
  // the specific field that failed (cert, key, or ca).
  const tls = manifest.tls
    ? {
        ca: manifest.tls.ca
          ? await readTlsFile(manifest.tls.ca, "tls.ca")
          : undefined,
        cert: await readTlsFile(manifest.tls.cert, "tls.cert"),
        key: await readTlsFile(manifest.tls.key, "tls.key"),
        passphrase: manifest.tls.passphrase,
      }
    : undefined;

  // Step 5: Start the MLLP server.
  // serve() creates a TCP server, binds it, and returns a Server
  // handle. Connection and error callbacks emit events for the
  // parent to display in the TUI or log as JSON lines.
  const server: Server = serve(app, {
    hostname: manifest.hostname,
    keepAlive: manifest.keepAlive,
    keepAliveInitialDelay: manifest.keepAliveInitialDelay,
    onConnect: (conn: ConnectionInfo) => {
      emit({
        id: conn.id,
        remote: `${conn.remoteAddress}:${conn.remotePort}`,
        t: "conn.open",
      });
    },
    onDisconnect: (conn: ConnectionInfo) => {
      emit({ id: conn.id, t: "conn.close" });
    },
    onError: (
      err: Error,
      conn: ConnectionInfo,
      info: MessageInfo | undefined
    ) => {
      emit({
        conn: conn.id,
        message: err.message,
        stack: err.stack,
        t: "error",
        trigger: info ? `${info.messageType}^${info.triggerEvent}` : undefined,
      });
    },
    port: manifest.port,
    socketTimeout: manifest.socketTimeout,
    tls,
  });

  // Step 6: Wait for the server to bind.
  // server.listening resolves once the TCP socket is bound. EADDRINUSE
  // is the common failure (another process holds the port) and gets a
  // targeted hint; every other bind error (EACCES for privileged ports,
  // EADDRNOTAVAIL for invalid hostnames, …) becomes a generic
  // child-crashed fatal with the underlying message preserved.
  try {
    await server.listening;
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "EADDRINUSE") {
      throw new GlionError(
        "port-in-use",
        `Port ${manifest.port} on ${manifest.hostname} is already in use.`,
        { code, hostname: manifest.hostname, port: manifest.port },
        "Stop the other process using this port, or set a different port in glion.config.ts.",
        error
      );
    }
    throw new GlionError(
      "child-crashed",
      `Failed to bind ${manifest.hostname}:${manifest.port}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { code, hostname: manifest.hostname, port: manifest.port },
      undefined,
      error
    );
  }

  // Step 7: Announce readiness.
  // This is the critical event the parent's supervisor waits for.
  // Until "ready" arrives, the supervisor considers the child to be
  // in the startup phase — a crash here is a startup-crash (no
  // respawn). After "ready", the supervisor's stability timer starts.
  emit({
    hostname: manifest.hostname,
    pid: process.pid,
    port: server.port,
    t: "ready",
    tls: !!manifest.tls,
  });

  // Step 8: Install signal handlers for graceful shutdown.
  // From here, the server runs until SIGTERM/SIGINT arrives from
  // the parent supervisor (or the user directly).
  installShutdownHandlers(server, emit);
}

// ── Top-level execution ──────────────────────────────────────────
// This file is executed as a script (not imported). The top-level
// await runs main() and catches any unhandled error, converting it
// to a structured fatal event so the parent always gets a machine-
// readable explanation of what went wrong.

try {
  await main();
} catch (error) {
  emit(fatalEvent(error));
  process.exit(1);
}
