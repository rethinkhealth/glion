/**
 * The connection-lifecycle state machine for {@link MllpClient}.
 *
 * The machine OWNS connection establishment. Opening the connection is an
 * **invoked actor** (`fromPromise`), so its success, failure, the connect
 * timeout, and cancellation are all modelled as XState transitions rather than
 * driven from the client and read back. Every connection error the machine can
 * produce is stamped into `context.error` — `CONNECT_FAILED` (the connector
 * rejected), `CONNECT_TIMEOUT` (`connectTimeoutMs` elapsed, a declarative
 * `after`), `CONNECT_ABORTED` (`close()` left `connecting` before it finished),
 * and `DROPPED` (the read loop saw the peer end an established connection,
 * carried on `DROP`). The error is the machine's record of WHY it closed; the
 * client throws it at the edge when it reads the settled result — it is never
 * read back as recoverable state.
 *
 * The machine does NOT know host/port/connector — it is handed a single `open`
 * operation (a closure the client supplies that opens one connection given an
 * abort signal). So the machine never mirrors the client's configuration, and a
 * re-attempt re-invokes the closure rather than a frozen target.
 *
 * What stays OUT: the per-send exchange (write a frame, await the ACK,
 * correlate MSH-10 ↔ MSA-2). It is a request/response `Promise` per call, and
 * XState events are fire-and-forget, so modelling it would mean smuggling
 * resolve/reject through events. Opening fits an actor (one-shot,
 * connection-scoped); a send does not. The read loop stays in `client.ts` and
 * reports a peer drop with `DROP`.
 *
 * Connect and reconnect are one path: the initial attempt and a re-attempt
 * after a drop route the same way — `connecting` → (fail) → `backingOff` →
 * `connecting`, retrying per the {@link RetryOptions} until attempts are
 * exhausted (→ `closed`). The first retry is immediate; backoff grows from the
 * second. With `NO_RETRY` (the current client default) a failed connection
 * attempt or a drop routes straight to `closed`.
 *
 * @module
 */

import { assign, createActor, fromPromise, setup } from "xstate";
import type { Actor, SnapshotFrom } from "xstate";

import { backoffDelay } from "./backoff";
import type { RetryOptions } from "./backoff";
import type { MllpDuplex } from "./client";
import { MllpClientError } from "./errors";

/** Opens one connection, honouring the abort signal. Supplied by the client. */
export type OpenConnection = (signal: AbortSignal) => Promise<MllpDuplex>;

/** What the connection machine needs to open the connection, time out, retry. */
export interface ConnectionStateInput {
  readonly options: RetryOptions;
  /** Deadline for a single connection attempt; the `connecting` timeout. */
  readonly connectTimeoutMs: number;
  /** The operation the machine invokes to open a connection. */
  readonly open: OpenConnection;
}

interface ConnectionStateContext {
  readonly options: RetryOptions;
  readonly connectTimeoutMs: number;
  readonly open: OpenConnection;
  /**
   * Failed connection attempts since the last successful connect. Reset on
   * connect.
   */
  attempt: number;
  /** The live duplex once the connection opens; `null` otherwise. */
  duplex: MllpDuplex | null;
  /**
   * Why the machine closed — stamped on the failing transition; the client
   * throws it at the edge when it reads the settled result.
   */
  error: MllpClientError | null;
}

/**
 * Events the client sends the machine. `CONNECT` starts the connection attempt
 * (the machine invokes `open`); `DROP` reports that the read loop saw the peer
 * end an established connection, carrying the error to surface; `CLOSE` is
 * explicit teardown. Open success/failure/timeout are NOT events — the invoked
 * `open` actor's `onDone` / `onError` and the `connecting` timeout drive those.
 */
type ConnectionStateEvent =
  | { type: "CONNECT" }
  | { type: "DROP"; error: MllpClientError }
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
  actors: {
    // Open one connection. The `signal` aborts when `connecting` is exited
    // (timeout, CLOSE, or settlement), so the connector cancels for free. The
    // post-resolution race — the connection opens just after CLOSE/timeout left
    // the state — is handled here, the layer that owns the duplex: close the
    // orphan so it can never leak. The throw is ignored (the actor is stopped).
    open: fromPromise<MllpDuplex, { open: OpenConnection }>(
      async ({ input, signal }) => {
        const duplex = await input.open(signal);
        if (signal.aborted) {
          await duplex.close();
          throw MllpClientError.connectionAborted();
        }
        return duplex;
      }
    ),
  },
  delays: {
    connectTimeout: ({ context }) => context.connectTimeoutMs,
    // Recomputed per `backingOff` entry (fresh jitter). `attempt` was just
    // incremented on entry, so it is 1-based — the first retry is immediate.
    retryDelay: ({ context }) => backoffDelay(context.options, context.attempt),
  },
  guards: {
    canRetry: ({ context }) => context.attempt < context.options.maxRetries,
  },
  types: {
    context: {} as ConnectionStateContext,
    events: {} as ConnectionStateEvent,
    input: {} as ConnectionStateInput,
  },
}).createMachine({
  context: ({ input }) => ({
    attempt: 0,
    connectTimeoutMs: input.connectTimeoutMs,
    duplex: null,
    error: null,
    open: input.open,
    options: input.options,
  }),
  id: "mllp-connection",
  initial: "idle",
  // Keys are alphabetical to satisfy sort-keys; the lifecycle order is
  // idle → connecting → connected → backingOff → connecting → … → closed,
  // documented in the module JSDoc.
  states: {
    // Waiting out the backoff before the next attempt. The `after` timer cancels
    // for free if CLOSE arrives meanwhile.
    backingOff: {
      after: { retryDelay: "connecting" },
      entry: "incrementAttempt",
      on: {
        CLOSE: {
          actions: assign({ error: () => MllpClientError.connectionAborted() }),
          target: "closed",
        },
      },
    },

    closed: { type: "final" },

    // The wire is up; the client binds its read loop here. A drop (carrying its
    // error) retries if attempts remain, else closes.
    connected: {
      entry: "resetAttempt",
      on: {
        CLOSE: "closed",
        DROP: [
          {
            actions: assign({ error: ({ event }) => event.error }),
            guard: "canRetry",
            target: "backingOff",
          },
          {
            actions: assign({ error: ({ event }) => event.error }),
            target: "closed",
          },
        ],
      },
    },

    // Opening — the machine invokes `open`. onDone → connected (store the
    // duplex); onError → retry/close (carry the error the closure threw); the
    // `after` timeout → retry/close (stamp CONNECT_TIMEOUT); CLOSE → close
    // (stamp CONNECT_ABORTED). Every exit stops the `open` actor, aborting its
    // signal.
    connecting: {
      after: {
        connectTimeout: [
          {
            actions: assign({
              error: ({ context }) =>
                MllpClientError.connectionTimeout(context.connectTimeoutMs),
            }),
            guard: "canRetry",
            target: "backingOff",
          },
          {
            actions: assign({
              error: ({ context }) =>
                MllpClientError.connectionTimeout(context.connectTimeoutMs),
            }),
            target: "closed",
          },
        ],
      },
      invoke: {
        input: ({ context }) => ({ open: context.open }),
        onDone: {
          actions: assign({ duplex: ({ event }) => event.output, error: null }),
          target: "connected",
        },
        onError: [
          {
            actions: assign({
              error: ({ event }) =>
                MllpClientError.connectionFailure(event.error),
            }),
            guard: "canRetry",
            target: "backingOff",
          },
          {
            actions: assign({
              error: ({ event }) =>
                MllpClientError.connectionFailure(event.error),
            }),
            target: "closed",
          },
        ],
        src: "open",
      },
      on: {
        CLOSE: {
          actions: assign({ error: () => MllpClientError.connectionAborted() }),
          target: "closed",
        },
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
 * A started connection-lifecycle state instance. Send it `CONNECT` / `DROP` /
 * `CLOSE`; the machine drives the connection attempt and stamps any error into
 * context. The concrete XState actor type is an implementation detail behind
 * {@link createConnectionState}.
 */
export type ConnectionState = Actor<typeof connectionMachine>;

/**
 * Create and start a connection-lifecycle state instance. The XState wiring
 * (`createActor`, `start`, input) lives here so the rest of the client treats
 * connection state as an opaque event-driven object.
 */
export function createConnectionState(
  input: ConnectionStateInput
): ConnectionState {
  const actor = createActor(connectionMachine, { input });
  actor.start();
  return actor;
}
