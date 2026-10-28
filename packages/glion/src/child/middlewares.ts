/**
 * MLLP message telemetry middleware.
 *
 * Emits a structured "msg" event for every processed HL7v2 message, capturing
 * timing, trigger event, control ID, and ACK code. This is the primary
 * observability signal for message throughput and latency — the TUI and
 * JSON-line output both consume these events.
 *
 * ## Middleware positioning
 *
 * This middleware MUST be PREPENDED via `app.use(mw, { prepend: true })`, so
 * it sits at the outermost position in the middleware chain: its `await
 * next()` completes after every user middleware has run, so `ctx.res` is the
 * reply that is sent, and `performance.now()` measures the full middleware +
 * handler time.
 *
 * ## ACK code
 *
 * HL7v2 acknowledgments carry MSA-1, an HL7v2 Table 0008 code:
 * AA/AE/AR at the application level, CA/CE/CR at the commit level.
 * The code is the reply's `code`; it is `null` for no reply, or a reply
 * with no Table 0008 code in MSA-1.
 */

import { performance } from "node:perf_hooks";

import type { Context, ErrorHandler, Middleware } from "@glion/mllp";
import type { NodeEnv } from "@glion/mllp/node";

import type { PartialEvent } from "../events";

/**
 * Creates the telemetry middleware. The `emit` function is injected
 * so the middleware doesn't depend on the module-scoped emitter —
 * easier to test and decoupled from the child's stdout wiring.
 */
export function createMsgTelemetry(
  emit: (event: PartialEvent) => void
): Middleware<NodeEnv> {
  return async (ctx: Context<NodeEnv>, next: () => Promise<void>) => {
    const start = performance.now();
    await next();
    const ms = performance.now() - start;
    const { connection } = ctx.env;
    emit({
      ack: ctx.res?.code ?? null,
      conn: connection.id,
      control: ctx.req.header.controlId ?? "?",
      ms: Math.round(ms * 1000) / 1000,
      pattern: null,
      remote: `${connection.remoteAddress}:${connection.remotePort}`,
      t: "msg",
      trigger: `${ctx.req.header.messageCode ?? "?"}^${ctx.req.header.triggerEvent ?? "?"}`,
    });
  };
}

/**
 * Creates the `app.onError()` handler that emits an "error" event for each
 * error a message raises.
 */
export function createErrorTelemetry(
  emit: (event: PartialEvent) => void
): ErrorHandler<NodeEnv> {
  return (error, { connection }) => {
    emit({
      conn: connection.id,
      message: error.message,
      stack: error.stack,
      t: "error",
    });
  };
}
