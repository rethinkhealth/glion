/**
 * The acknowledgment this app sends for each message it receives.
 *
 * - The handler returns: `MSA|AA`.
 * - The handler throws an `AckException`: its code in MSA-1, its message in
 *   MSA-3, and an ERR segment with its error code and severity.
 * - The handler throws anything else: `MSA|AE` with the fixed text `Application
 *   internal error` and ERR-3 `207`. Nothing of the error reaches the sending
 *   system.
 *
 * @module
 */

import {
  AckCode,
  AckException,
  ApplicationInternalError,
  Hl7ErrorCode,
  Severity,
} from "@glion/ack";
import { c, f, m, s } from "@glion/builder";
import type { Context, Response } from "@glion/mllp";
import { toHl7v2 } from "@glion/to-hl7v2";
import { select } from "@glion/util-query";
import { uid } from "@glion/util-uid";

const NOT_A_DIGIT = /\D/g;

/**
 * The acknowledgment of the message in `ctx`: `AA` without `error`, the NAK
 * `error` stands for with it.
 *
 * MSH-3/4 and MSH-5/6 are the message's MSH-5/6 and MSH-3/4. MSH-11 and MSH-12
 * are the message's own. MSA-2 is the message's MSH-10. Every value is written
 * with escape sequences for the delimiters it holds.
 */
export function acknowledge(ctx: Context, error?: Error): Response {
  const field = (path: `MSH.${number}`) =>
    structuredClone(select(ctx.ast, path)?.node) ?? f();

  const header = s(
    "MSH",
    f("|"),
    f("^~\\&"),
    field("MSH.5"),
    field("MSH.6"),
    field("MSH.3"),
    field("MSH.4"),
    f(now()),
    f(),
    f(c("ACK"), c(ctx.triggerEvent), c("ACK")),
    f(uid()),
    field("MSH.11"),
    field("MSH.12")
  );

  if (!error) {
    const accept = s("MSA", f(AckCode.ApplicationAccept), f(ctx.controlId));
    return { raw: toHl7v2(m(header, accept)) };
  }

  const nak =
    error instanceof AckException
      ? error
      : new ApplicationInternalError("Application internal error", error);
  return {
    raw: toHl7v2(
      m(
        header,
        s("MSA", f(nak.code), f(ctx.controlId), f(nak.message)),
        s(
          "ERR",
          f(),
          f(),
          f(
            c(nak.errorCode ?? Hl7ErrorCode.ApplicationInternalError),
            c(),
            c("HL70357")
          ),
          f(nak.severity ?? Severity.Error)
        )
      )
    ),
  };
}

/** The current time as an HL7v2 DTM in UTC: `20261023143005+0000`. */
function now(): string {
  return `${new Date().toISOString().replace(NOT_A_DIGIT, "").slice(0, 14)}+0000`;
}
