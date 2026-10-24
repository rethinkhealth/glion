import { isAckCode } from "@glion/ack";
import type { AckCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import { encodeBytes } from "@glion/util-charset";
import { value } from "@glion/util-query";

/** Marks a {@link Reply}. */
const REPLY: unique symbol = Symbol("Reply");

/**
 * A reply to a message: an HL7v2 message serialized as UTF-8, built by
 * `ctx.ack()` or `ctx.reply()`. Immutable.
 */
export interface Reply {
  readonly [REPLY]: true;
  /** The message serialized as UTF-8, without MLLP framing. */
  readonly bytes: Uint8Array;
  /** MSA-1, or `undefined` when the message has no acknowledgment code. */
  readonly code: AckCode | undefined;
}

/**
 * `message` as a {@link Reply}, written with `serialize`. Its `code` is
 * MSA-1 of `message`. Throws what `serialize` throws.
 */
export function toReply(
  message: Root,
  serialize: (tree: Root) => string
): Reply {
  const code = value(message, "MSA.1")?.value ?? "";
  return Object.freeze({
    [REPLY]: true as const,
    bytes: encodeBytes(serialize(message)),
    code: isAckCode(code) ? code : undefined,
  });
}

/** Whether `value` is a {@link Reply}. */
export function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && REPLY in value;
}
