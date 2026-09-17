/**
 * The client's phases, and what each one is holding: the session, the message
 * in flight, and the close.
 *
 * Types only. A phase changes by replacing the object, never by mutating it.
 *
 * @module
 */

import type { MllpClientError } from "./errors";
import type { MllpSession } from "./session";

export type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "connecting";
      /** The dialing. Settles as `connect()` does. */
      readonly opening: Promise<void>;
      /** Aborted by `close()` and `destroy()`. Stops the dialing. */
      readonly abort: AbortController;
    }
  | {
      readonly phase: "connected";
      readonly session: MllpSession;
    }
  | {
      readonly phase: "sending";
      readonly session: MllpSession;
    }
  | {
      readonly phase: "closing";
      /** The failure the client is closing on, or `null` when the owner is. */
      readonly reason: MllpClientError | null;
      /** The session being ended, or `null` when it is the dial. */
      readonly session: MllpSession | null;
      /** Settles once the client is `closed`. */
      readonly closed: Promise<unknown>;
    }
  | {
      readonly phase: "closed";
      /** The failure that closed the client, or `null` when the owner did. */
      readonly reason: MllpClientError | null;
    };

/** The phases with something open: the dial, or the session. */
export type Open = Extract<
  State,
  { phase: "connecting" | "connected" | "sending" }
>;
