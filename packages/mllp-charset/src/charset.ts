import { AckApplicationReject, Hl7ErrorCode, Severity } from "@glion/ack";
import { CHARSET_RULE_ID, HL7V2_LINT_SOURCE } from "@glion/lint-charset";
import type { Middleware } from "@glion/mllp";

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
 * encoding). Register it **inside** an acknowledgment middleware so the throw
 * becomes a NAK:
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

    // The parser always yields a `root`, so the rule's only fatal message on
    // this path is a genuine MSH-18 violation — not its non-root developer guard.
    const violation = ctx.file.messages.find(
      (message) =>
        message.fatal === true &&
        message.source === HL7V2_LINT_SOURCE &&
        message.ruleId === CHARSET_RULE_ID
    );

    if (violation) {
      throw new AckApplicationReject(violation.reason, {
        cause: violation,
        errorCode: Hl7ErrorCode.DataTypeError,
        severity: Severity.Error,
      });
    }

    await next();
  };
}
