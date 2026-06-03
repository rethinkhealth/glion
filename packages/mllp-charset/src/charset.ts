import { AckApplicationReject, Hl7ErrorCode, Severity } from "@glion/ack";
import type { Middleware } from "@glion/mllp";

/** ERR-2 location for every charset reject — the rule only ever checks MSH-18. */
const MSH18_LOCATION = {
  fieldPosition: 18,
  segmentId: "MSH",
  segmentSequence: 1,
} as const;

/**
 * MLLP middleware that rejects inbound messages whose declared `MSH-18`
 * character set is not allowed — the server-side strict mode for
 * {@link https://github.com/rethinkhealth/glion/tree/main/packages/lint-charset | @glion/lint-charset}.
 *
 * It forces the lazy pipeline with `await ctx.tree()` so the charset rule runs,
 * then looks for a fatal charset diagnostic on `ctx.file`. unified's
 * `run()`/`process()` never reject on a collected fatal message, so the
 * decision to reject belongs here — the layer that owns the wire response.
 *
 * On a violation it throws {@link AckApplicationReject} (MSA-1 `AR`; ERR-3
 * `102` data-type error, the closest Table 0357 condition for an undecodable
 * encoding) with the error located at `MSH^1^18` (ERR-2) and the reason as
 * diagnostic information (ERR-7). Register it **inside** an acknowledgment
 * middleware so the throw becomes a NAK:
 *
 * ```ts
 * app.use(ackMiddleware());
 * app.use(charsetMiddleware());
 * ```
 *
 * The allow-list lives with the rule, not here: configure `@glion/lint-charset`
 * (default UTF-8) in the processor. Enforcement only fires when that rule runs
 * at `error` severity — the default in `@glion/preset-lint-recommended` — so a
 * pipeline that downgrades or omits the rule passes every message through.
 */
export function charsetMiddleware(): Middleware {
  return async (ctx, next) => {
    // Trigger the transformers so the charset rule populates ctx.file.messages.
    await ctx.tree();

    // Diagnostics from @glion/lint-charset (origin "hl7v2-lint:charset"). The
    // parser always yields a `root`, so the rule's only fatal message here is a
    // genuine MSH-18 violation — not its non-root developer guard.
    const violation = ctx.file.messages.find(
      (message) =>
        message.fatal === true &&
        message.source === "hl7v2-lint" &&
        message.ruleId === "charset"
    );

    if (violation) {
      throw new AckApplicationReject(violation.reason, {
        cause: violation,
        diagnosticInformation: violation.reason,
        errorCode: Hl7ErrorCode.DataTypeError,
        errorLocation: MSH18_LOCATION,
        severity: Severity.Error,
      });
    }

    await next();
  };
}
