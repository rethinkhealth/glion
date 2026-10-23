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
 * This middleware is PREPENDED via `app.use(mw, { prepend: true })` so it sits
 * at the outermost position in the middleware chain and `performance.now()`
 * measures the full middleware + handler time. `await next()` never throws,
 * so `ctx.res` holds the reply, ACK or NAK, when telemetry reads it.
 *
 * ## ACK parsing
 *
 * HL7v2 acknowledgments carry MSA-1, an HL7v2 Table 0008 code:
 * AA/AE/AR at the application level, CA/CE/CR at the commit level.
 * The code is extracted from the response's raw HL7v2 text via
 * regex — no full parse needed since MSA is always near the top of
 * the ACK message. Returns null for responses that don't follow the
 * standard ACK structure (custom responses, missing MSA).
 */

import { performance } from "node:perf_hooks";

import { isAckCode } from "@glion/ack";
import type { AckCode } from "@glion/ack";
import type { Context, Middleware, Response } from "@glion/mllp";

import type { PartialEvent } from "../events";

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

// MSH-1, the character after `MSH`, is the field separator; the
// backreference `\1` reuses it to find MSA-1 in the segment that starts
// with `MSA` after a `\r`:
//
//   MSH|^~\&|...\rMSA|CA|MSG001  →  CA
//   MSH#|~\&#...\rMSA#CA#MSG001  →  CA
const MSA_PATTERN = /^MSH(.).*?\rMSA\1([A-Z]{2})\1/s;

/** MSA-1 of the reply in `raw`, or `null` when it holds no Table 0008 code. */
function parseAckCode(raw: string | undefined): AckCode | null {
  if (!raw) {
    return null;
  }
  const code = MSA_PATTERN.exec(raw)?.[2];
  return code !== undefined && isAckCode(code) ? code : null;
}
