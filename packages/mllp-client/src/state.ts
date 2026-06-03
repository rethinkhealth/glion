/**
 * The connection-lifecycle state machine for {@link MllpClient}.
 *
 * This machine owns ONLY the connection lifecycle — which lifecycle phase the
 * client is in, and the retry/backoff timing between a failed dial and the
 * next. It is a PURE state machine: it performs no I/O. The client drives every
 * transition by sending events at the points where it dials, observes a drop,
 * or closes, and it reads the machine's state to answer `client.state`. All I/O
 * — dialling, the read loop, the per-send wire exchange, teardown — stays
 * native in `client.ts`. The per-send exchange in particular (write a frame,
 * await the ACK, correlate MSH-10 ↔ MSA-2) is deliberately NOT modelled here:
 * XState events are fire-and-forget, so the exchange's `Promise<Response>`
 * cannot live in the machine without smuggling resolve/reject through events.
 *
 * What the machine buys over a hand-rolled status field: legal transitions are
 * enforced by construction (an event a state does not handle is ignored, not a
 * silent illegal mutation), and the backoff is a declarative `after` timer that
 * cancels for free when `CLOSE` leaves the `backingOff` state — no manual
 * `clearTimeout`.
 *
 * A dial is a dial: there is no fail-fast special case for the initial connect.
 * Any failed dial — the first `connect()` or a redial after a drop — routes the
 * same way: `connecting` → (`FAILED`) → `backingOff` → `connecting`,
 * retrying per the {@link RetryOptions} until attempts are exhausted (→
 * `closed`). The first retry is immediate; backoff grows from the second. With
 * `NO_RETRY` (the current client default) a failed dial or a drop routes
 * straight to `closed` — the behaviour the client has today. The options and
 * the backoff maths live in `./util/backoff`.
 *
 * @module
 */

import { assign, createActor, setup } from "xstate";
import type { Actor, SnapshotFrom } from "xstate";

import { backoffDelay } from "./util/backoff";
import type { RetryOptions } from "./util/backoff";

/** Input passed to the connection machine when its actor is created. */
export interface ConnectionInput {
  readonly options: RetryOptions;
}

interface ConnectionContext {
  readonly options: RetryOptions;
  /** Failed-dial attempts since the last successful connect. Reset on connect. */
  attempt: number;
}

/**
 * Events the client feeds the machine. `CONNECT` starts a dial; `CONNECTED` /
 * `FAILED` report its outcome (initial connect AND redials use the same
 * pair — the state, not the event, decides the routing). `DROP` is sent when
 * the read loop or drop watcher observes the peer ending an established
 * connection. `CLOSE` is explicit teardown. The machine tracks only the
 * lifecycle phase, not the failure detail — the client surfaces the actual
 * error to the caller (the connect throw, the in-flight send rejection), so no
 * error rides on these events.
 */
export type ConnectionEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "FAILED" }
  | { type: "DROP" }
  | { type: "CLOSE" };

/**
 * The connection-lifecycle machine definition. Internal — callers create a
 * running instance via {@link createConnectionState}, which keeps the XState
 * dependency from leaking past this module.
 */
const connectionMachine = setup({
  actions: {
    incrementAttempt: assign({
      attempt: ({ context }) => context.attempt + 1,
    }),
    resetAttempt: assign({ attempt: 0 }),
  },
  delays: {
    // Recomputed on each entry to `backingOff` (so jitter is fresh per attempt).
    // `attempt` was just incremented on entry, so it is 1-based here — the first
    // retry (attempt 1) is immediate.
    retryDelay: ({ context }) => backoffDelay(context.options, context.attempt),
  },
  guards: {
    canRetry: ({ context }) => context.attempt < context.options.maxRetries,
  },
  types: {
    context: {} as ConnectionContext,
    events: {} as ConnectionEvent,
    input: {} as ConnectionInput,
  },
}).createMachine({
  context: ({ input }) => ({
    attempt: 0,
    options: input.options,
  }),
  id: "mllp-connection",
  initial: "idle",
  // Keys are alphabetical to satisfy sort-keys; the lifecycle order is
  // idle → connecting → connected → backingOff → connecting → … → closed,
  // documented in the module JSDoc.
  states: {
    // Waiting out the backoff delay before the next dial. Entering increments
    // the attempt counter (so the first retry, attempt 1, is immediate); the
    // `after` timer is cancelled for free if CLOSE arrives meanwhile.
    backingOff: {
      after: { retryDelay: "connecting" },
      entry: "incrementAttempt",
      on: { CLOSE: "closed" },
    },

    closed: { type: "final" },

    // The wire is up. The client binds its duplex/read-loop while here. Entering
    // resets the attempt counter. A drop retries if attempts remain, else closes.
    connected: {
      entry: "resetAttempt",
      on: {
        CLOSE: "closed",
        DROP: [
          { guard: "canRetry", target: "backingOff" },
          { target: "closed" },
        ],
      },
    },

    // Dialling — the client dials and reports the outcome. Covers the initial
    // connect AND every redial: a failed dial retries until attempts run out.
    connecting: {
      on: {
        CLOSE: "closed",
        CONNECTED: "connected",
        FAILED: [
          { guard: "canRetry", target: "backingOff" },
          { target: "closed" },
        ],
      },
    },

    idle: {
      on: { CLOSE: "closed", CONNECT: "connecting" },
    },
  },
});

/**
 * The connection machine's state values. This IS the client's public
 * `MllpClientState` (re-exported under that name) — derived from the machine so
 * the public state can never drift from the actual lifecycle.
 */
export type ConnectionPhase = SnapshotFrom<typeof connectionMachine>["value"];

/**
 * A started connection-lifecycle state instance: send it events
 * (`CONNECT`/`CONNECTED`/`DROP`/`CLOSE`/…) and read `getSnapshot().value` for
 * the current {@link ConnectionPhase}. The concrete XState actor type is an
 * implementation detail behind {@link createConnectionState}.
 */
export type ConnectionState = Actor<typeof connectionMachine>;

/**
 * Create and start a connection-lifecycle state instance for the given retry
 * options. The XState wiring (`createActor`, `start`, input) lives here so the
 * rest of the client treats connection state as an opaque event-driven object —
 * keeping the state machine swappable.
 */
export function createConnectionState(options: RetryOptions): ConnectionState {
  const actor = createActor(connectionMachine, { input: { options } });
  actor.start();
  return actor;
}
