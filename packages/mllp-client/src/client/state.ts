/**
 * The client's phases, and what each one is holding.
 *
 * Types only. A phase changes by replacing the object, never by mutating it.
 *
 * @module
 */

export type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "connecting";
      /**
       * The attempt, settling only once the phase has moved on. A second
       * `connect()` awaits this and gets the first one's outcome.
       */
      readonly ready: Promise<void>;
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
  | { readonly phase: "closed" };
