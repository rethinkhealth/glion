/**
 * How a remote system answers one message, and the replies the tests reuse.
 * Message level: nothing here knows about a socket.
 *
 * @module
 */

import { ack, controlIdOf } from "./fixtures";

/**
 * The text of a reply, framed on the way out; raw bytes, sent as they are; or
 * `undefined` for no reply.
 */
export type Reply = (
  message: string
) => string | Uint8Array | undefined | Promise<string | Uint8Array | undefined>;

/** Acknowledges every message with an MSA-1 of `code`, `msa3` in MSA-3. */
export function acknowledging(code: string, msa3 = ""): Reply {
  return (message) => ack(code, { controlId: controlIdOf(message), msa3 }).text;
}

/** Never answers. */
export const silence: Reply = () => {};
