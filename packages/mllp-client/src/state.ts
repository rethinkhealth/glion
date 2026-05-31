/**
 * The connection-lifecycle state machine for {@link MllpClient}.
 *
 * This machine owns ONLY the connection lifecycle — which lifecycle phase the
 * client is in, and the reconnect/backoff timing between a drop and a redial.
 * It is a PURE state machine: it performs no I/O. The client drives every
 * transition by sending events at the points where it dials, observes a drop,
 * or closes, and it reads the machine's state to answer `client.state`. All
 * I/O — dialling, the read loop, the per-send wire exchange, teardown — stays
 * native in `client.ts`. The per-send exchange in particular (write a frame,
 * await the ACK, correlate MSH-10 ↔ MSA-2) is deliberately NOT modelled here:
 * XState events are fire-and-forget, so the exchange's `Promise<Response>`
 * cannot live in the machine without smuggling resolve/reject through events.
 *
 * What the machine buys over a hand-rolled status field: legal transitions are
 * enforced by construction (an event a state does not handle is ignored, not a
 * silent illegal mutation), and the reconnect backoff is a declarative `after`
 * timer that cancels for free when `CLOSE` leaves the `backingOff` state — no
 * manual `clearTimeout`.
 *
 * Backoff applies to reconnects only. The INITIAL connect fails fast
 * (`connecting` → `closed` on `CONNECT_FAILED`), so `connect()` surfaces a
 * prompt error. A drop AFTER a successful connect routes `connected` →
 * `backingOff` → `reconnecting`, retrying per the {@link ReconnectPolicy}. With
 * `NO_RECONNECT` (the current client default) a drop routes straight to
 * `closed` — the behaviour the client has today. The policy and its backoff
 * maths live in `./reconnect.ts`.
 *
 * @module
 */

import { assign, setup } from "xstate";
import type { SnapshotFrom } from "xstate";

import { backoffDelay } from "./reconnect";
import type { ReconnectPolicy } from "./reconnect";

/** Input passed to {@link connectionMachine} when the actor is created. */
export interface ConnectionInput {
  readonly policy: ReconnectPolicy;
}

interface ConnectionContext {
  readonly policy: ReconnectPolicy;
  /** Reconnect attempts since the last successful connect. Reset on connect. */
  attempt: number;
  /** Last dial/drop error, for diagnostics. */
  lastError: unknown;
}

/**
 * Events the client feeds the machine. `CONNECT` starts the initial dial;
 * `CONNECTED`/`CONNECT_FAILED` report its outcome. `DROP` is sent when the read
 * loop or drop watcher observes the peer ending an established connection.
 * `RECONNECT_FAILED` reports a failed redial. `CLOSE` is explicit teardown.
 */
export type ConnectionEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "CONNECT_FAILED"; error?: unknown }
  | { type: "DROP"; error?: unknown }
  | { type: "RECONNECT_FAILED"; error?: unknown }
  | { type: "CLOSE" };

/** The connection-lifecycle machine. See the module JSDoc for the model. */
export const connectionMachine = setup({
  actions: {
    incrementAttempt: assign({
      attempt: ({ context }) => context.attempt + 1,
    }),
    recordError: assign({
      lastError: ({ event }) => ("error" in event ? event.error : null),
    }),
    resetAttempt: assign({ attempt: 0 }),
  },
  delays: {
    // Recomputed on each entry to `backingOff` (so jitter is fresh per
    // attempt). `attempt` was just incremented on entry, so it is 1-based here.
    reconnectDelay: ({ context }) =>
      backoffDelay(context.policy, context.attempt),
  },
  guards: {
    canReconnect: ({ context }) =>
      context.attempt < context.policy.maxReconnectAttempts,
  },
  types: {
    context: {} as ConnectionContext,
    events: {} as ConnectionEvent,
    input: {} as ConnectionInput,
  },
}).createMachine({
  context: ({ input }) => ({
    attempt: 0,
    lastError: null,
    policy: input.policy,
  }),
  id: "mllp-connection",
  initial: "idle",
  // Keys are alphabetical to satisfy sort-keys; the lifecycle order is
  // idle → connecting → connected → backingOff → reconnecting → closed,
  // documented in the module JSDoc.
  states: {
    // Waiting out the backoff delay. Entering increments the attempt counter;
    // the `after` timer is cancelled for free if CLOSE arrives meanwhile.
    backingOff: {
      after: { reconnectDelay: "reconnecting" },
      entry: "incrementAttempt",
      on: { CLOSE: "closed" },
    },

    closed: { type: "final" },

    // The wire is up. The client binds its duplex/read-loop while here and
    // drains the send queue. Entering resets the reconnect attempt counter. A
    // drop routes to reconnect if attempts remain, else to closed.
    connected: {
      entry: "resetAttempt",
      on: {
        CLOSE: "closed",
        DROP: [
          {
            actions: "recordError",
            guard: "canReconnect",
            target: "backingOff",
          },
          { actions: "recordError", target: "closed" },
        ],
      },
    },

    // Initial connect — the client dials and reports the outcome. Fails fast
    // (no backoff) so connect() surfaces a prompt error.
    connecting: {
      on: {
        CLOSE: "closed",
        CONNECTED: "connected",
        CONNECT_FAILED: { actions: "recordError", target: "closed" },
      },
    },

    idle: {
      on: { CLOSE: "closed", CONNECT: "connecting" },
    },

    // Re-dialling after a drop — the client dials and reports the outcome.
    // Unlike `connecting`, a failure loops back through backoff until attempts
    // are exhausted.
    reconnecting: {
      on: {
        CLOSE: "closed",
        CONNECTED: "connected",
        RECONNECT_FAILED: [
          {
            actions: "recordError",
            guard: "canReconnect",
            target: "backingOff",
          },
          { actions: "recordError", target: "closed" },
        ],
      },
    },
  },
});

/**
 * The connection machine's state values — the union the client maps onto its
 * public {@link MllpClientState}. Derived from the machine so the two can't
 * drift apart.
 */
export type ConnectionPhase = SnapshotFrom<typeof connectionMachine>["value"];
