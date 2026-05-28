/**
 * MLLP message telemetry middleware.
 *
 * Emits a structured "msg" event for every processed HL7v2 message,
 * capturing timing, trigger event, control ID, and ACK code. This
 * is the primary observability signal for message throughput and
 * latency — the TUI and JSON-line output both consume these events.
 *
 * ## Middleware positioning
 *
 * This middleware must be PREPENDED via `app.use(mw, { prepend: true })`
 * so it sits at the outermost position in the middleware chain. Its
 * `await next()` then completes after all user middleware (including
 * `ackMiddleware`) have run, ensuring `ctx.res` is populated with the
 * ACK response before telemetry reads it. `performance.now()` measures
 * the full middleware + handler time.
 *
 * ## ACK parsing
 *
 * HL7v2 acknowledgments contain an MSA segment with a two-letter
 * code: AA (accepted), AE (error), AR (rejected). The code is
 * extracted from the response's raw HL7v2 text via regex — no full
 * parse needed since MSA is always near the top of the ACK message.
 * Returns null for responses that don't follow the standard ACK
 * structure (custom responses, missing MSA).
 */

import { performance } from "node:perf_hooks";

import type { Context, Middleware, Response } from "@glion/mllp";

import type { PartialEvent } from "../events.js";

/**
 * Creates the telemetry middleware. The `emit` function is injected
 * so the middleware doesn't depend on the module-scoped emitter —
 * easier to test and decoupled from the child's stdout wiring.
 */
export function createMsgTelemetry(
  emit: (event: PartialEvent) => void
): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    const start = performance.now();
    await next();
    const ms = performance.now() - start;
    const response: Response | undefined = ctx.res;
    emit({
      ack: parseAckCode(response?.raw),
      conn: ctx.connection.id,
      control: ctx.controlId ?? "?",
      ms: Math.round(ms * 1000) / 1000,
      pattern: null,
      remote: `${ctx.connection.remoteAddress}:${ctx.connection.remotePort}`,
      t: "msg",
      trigger: `${ctx.messageType ?? "?"}^${ctx.triggerEvent ?? "?"}`,
    });
  };
}

// ── ACK parsing ──────────────────────────────────────────────────

/**
 * Extracts the ACK code (AA, AE, AR) from an HL7v2 ACK response.
 *
 * HL7v2 segments are separated by `\r`. The MSA segment contains
 * the acknowledgment code in its first field: `MSA|AA|...`. The
 * regex matches MSA at the start of a segment (after `\r` or at
 * position 0) and captures the two-letter code.
 */
const MSA_PATTERN = /(?:^|\r)MSA\|([A-Z]{2})\|/;

function parseAckCode(raw: string | undefined): "AA" | "AE" | "AR" | null {
  if (!raw) {
    return null;
  }
  const match = MSA_PATTERN.exec(raw);
  const code = match?.[1];
  if (code === "AA" || code === "AE" || code === "AR") {
    return code;
  }
  return null;
}
