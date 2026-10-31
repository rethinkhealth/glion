import { isAckCode } from "@glion/ack";
import type { AckCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { encodeBytes } from "@glion/util-charset";
import { value as queryValue } from "@glion/util-query";

/** Marks an {@link MllpResponse}. */
const RESPONSE: unique symbol = Symbol("MllpResponse");

/**
 * A response to a message: an HL7v2 message serialized as UTF-8, built by
 * `ctx.ack()` or `ctx.reply()`.
 */
export interface MllpResponse {
  readonly [RESPONSE]: true;
  /** The message serialized as UTF-8, without MLLP framing. */
  readonly bytes: Uint8Array;
  /** MSA-1, or `undefined` when the message has no acknowledgment code. */
  readonly code: AckCode | undefined;
}

/**
 * `message` as an {@link MllpResponse}, written with `serialize`. Its `code` is
 * MSA-1 of `message`. Throws what `serialize` throws.
 */
export function toResponse(
  message: Root,
  serialize: (tree: Root) => string
): MllpResponse {
  const code = queryValue(message, "MSA.1")?.value ?? "";
  return {
    [RESPONSE]: true,
    bytes: encodeBytes(serialize(message)),
    code: isAckCode(code) ? code : undefined,
  };
}

/** Whether `value` is an {@link MllpResponse}. */
export function isResponse(value: unknown): value is MllpResponse {
  return typeof value === "object" && value !== null && RESPONSE in value;
}
