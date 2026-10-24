import { c, f, m, s } from "@glion/builder";
import type { Context, Response } from "@glion/mllp";
import { toHl7v2 } from "@glion/to-hl7v2";
import { uid } from "@glion/util-uid";

const NOT_A_DIGIT = /\D/g;

/** An `AA` acknowledgment of the message in `ctx`. */
export function accept(ctx: Context): Response {
  const now = new Date().toISOString().replace(NOT_A_DIGIT, "").slice(0, 14);
  const header = s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f("GLION"),
    f(),
    f(),
    f(),
    f(`${now}+0000`),
    f(),
    f(c("ACK"), c(ctx.triggerEvent), c("ACK")),
    f(uid()),
    f("P"),
    f(ctx.version)
  );
  const acknowledgment = s("MSA", f("AA"), f(ctx.controlId));
  return { raw: toHl7v2(m(header, acknowledgment)) };
}
