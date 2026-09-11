/**
 * The client's phases, and what each one is holding: the message in flight,
 * and the close. Connectivity is the connection's.
 *
 * Types only. A phase changes by replacing the object, never by mutating it.
 *
 * @module
 */

import type { MllpClientError } from "../errors";

export type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "sending";
      /** MSH-10 of the message waiting for its acknowledgment. */
      readonly controlId: string;
      /** Settles when the send is over, however it ended. */
      readonly done: Promise<unknown>;
    }
  | {
      readonly phase: "closing";
      /** The send `close()` is waiting out. */
      readonly done: Promise<unknown>;
    }
  | {
      readonly phase: "closed";
      /** The failure that closed the client, or `null` when the owner did. */
      readonly reason: MllpClientError | null;
    };
