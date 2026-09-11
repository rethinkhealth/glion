/**
 * The client's phases, and what each one is holding.
 *
 * Types only. A phase changes by replacing the object, never by mutating it.
 *
 * @module
 */

import type { MllpClientError } from "../errors";

export type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "connecting";
      /**
       * Settles once the phase has moved on, to `connected` or to `closed`.
       * Never rejects. A waiter reads the phase after it settles.
       */
      readonly ready: Promise<void>;
      /** Aborted by `close()` and `destroy()`. Ends a wait between attempts. */
      readonly abort: AbortController;
    }
  | { readonly phase: "connected" }
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
