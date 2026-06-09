/**
 * The connection-lifecycle state machine — the engine behind
 * {@link MllpClient}.
 *
 * The machine OWNS the connection end-to-end: opening it (an invoked `open`
 * actor), the live wire while connected (an invoked `wire` actor),
 * single-flight sending, retry/backoff, teardown, and — crucially — **every
 * error decision**. `MllpClient` is a thin facade that turns method calls into
 * events and adapts the machine's outcome back to a `Promise`.
 *
 * **How a result reaches the caller (the bridge).** XState is tell-not-ask:
 * `actor.send()` returns void and `emit` is a fire-and-forget observer channel
 * with no request/response correlation (verified against xstate@5.32.0). So the
 * caller's deferred travels WITH the request: `CONNECT`/`SEND` carry a `settle`
 * ({@link Deferred}), and the machine settles it — directly for an illegal or
 * failed operation (the machine constructs the typed {@link MllpClientError}),
 * or via the `wire` for a send's ACK/NAK/timeout/drop. Nothing is parked in
 * `context` as an "error to read back"; there are no
 * `rejectConnect`/`rejectSend` helpers. The one cost is that two event types
 * carry callbacks — acceptable because these events are internal and never
 * serialized or replayed.
 *
 * **The actor taxonomy (verified).** `open` is a `fromPromise` (one-shot
 * result, abortable via its `signal`). `wire` is a `fromCallback` — the only
 * built-in actor kind with an inbound channel (`receive`) as well as an
 * outbound one (`sendBack`), which the wire needs to take `WRITE` down and push
 * `DROP` up from one persistent reader. The per-send exchange is deliberately
 * NOT its own actor: the ACK arrives on the wire's single reader, so a per-send
 * promise could never be fed the frame — it stays a deferred inside
 * {@link createConnection}, which the `wire` simply pipes to the caller's
 * `settle`.
 *
 * **Single-flight is a state.** `connected` is compound (`ready`/`sending`): a
 * `SEND` is legal only in `ready`, so a concurrent send falls out of the table
 * as `SEND_IN_PROGRESS`. Connect and reconnect are one path — a failed attempt
 * or a drop routes `connecting → backingOff → connecting`, retrying per
 * {@link RetryOptions} until exhausted (→ `closed`).
 *
 * @module
 */

import {
  assign,
  createActor,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
} from "xstate";
import type { Actor } from "xstate";

import type { MllpClientResponse } from "./ack";
import { backoffDelay } from "./backoff";
import type { RetryOptions } from "./backoff";
import type { MllpDuplex } from "./client";
import { createConnection } from "./connection";
import { MllpClientError, MllpErrorCode } from "./errors";

/**
 * Opens one connection. Supplied by the client.
 *
 * **Contract — honour the `signal`.** The implementer owns cancellation
 * entirely: if `signal` aborts, it MUST reject and leave nothing live —
 * including the race where the connection opens _just after_ the abort (close
 * that orphan rather than returning it). The machine passes its own abort
 * signal (fired when `connecting` is exited) straight through and trusts this
 * contract, so the abort ↔ close ↔ reject wiring lives at the layer that owns
 * the socket, not in the state machine.
 */
export type OpenConnection = (signal: AbortSignal) => Promise<MllpDuplex>;

/**
 * A caller's deferred, handed to the machine on the event so the machine can
 * settle it — the bridge from a fire-and-forget `send()` to the caller's
 * `Promise`. {@link reject} carries the machine's typed error (or a NAK
 * `AckException`); {@link resolve} the success value.
 */
export interface Deferred<T> {
  reject(reason: unknown): void;
  resolve(value: T): void;
}

/** The flattened public phase — `connected`'s compound value collapses to it. */
export type ConnectionPhase =
  | "backingOff"
  | "closed"
  | "connected"
  | "connecting"
  | "idle";

/** What the machine needs to open the connection, time it out, and retry. */
export interface ConnectionStateInput {
  readonly connectTimeoutMs: number;
  readonly host: string;
  readonly maxBufferedBytes: number | undefined;
  readonly open: OpenConnection;
  readonly options: RetryOptions;
  readonly port: number;
}

interface ConnectionStateContext {
  readonly connectTimeoutMs: number;
  readonly host: string;
  readonly maxBufferedBytes: number | undefined;
  readonly open: OpenConnection;
  readonly options: RetryOptions;
  readonly port: number;
  /** Failed attempts since the last successful connect; reset on connect. */
  attempt: number;
  /** The in-flight connect's deferred, held across retries until settled. */
  connectDeferred: Deferred<void> | null;
  /** The live duplex once the connection opens; `null` otherwise. */
  duplex: MllpDuplex | null;
}

/**
 * Events the machine processes. `CONNECT`/`SEND` come from the client carrying
 * the caller's `settle`; `EXCHANGE_COMPLETE`/`DROP` come from the `wire` via
 * `sendBack` (a send finished / the peer ended the connection); `CLOSE` is
 * teardown.
 */
type ConnectionStateEvent =
  | { type: "CONNECT"; settle: Deferred<void> }
  | {
      type: "SEND";
      framed: Uint8Array;
      requestControlId: string;
      timeoutMs: number;
      settle: Deferred<MllpClientResponse>;
    }
  | { type: "EXCHANGE_COMPLETE" }
  | { type: "DROP"; error: MllpClientError }
  | { type: "CLOSE" };

/** What the `wire` actor is handed when invoked in `connected`. */
interface WireInput {
  readonly duplex: MllpDuplex;
  readonly host: string;
  readonly maxBufferedBytes: number | undefined;
  readonly port: number;
}

/** The one event the `wire` receives from the machine: write a framed message. */
interface WireEvent {
  type: "WRITE";
  framed: Uint8Array;
  requestControlId: string;
  timeoutMs: number;
  settle: Deferred<MllpClientResponse>;
}

/**
 * Open one connection. A thin actor: it forwards the abort `signal` to the
 * {@link OpenConnection} and trusts that contract (reject + no orphan on abort).
 * Cancellation — including closing a connection that opened just after the
 * abort — is the connector's concern, not this machine's.
 */
const open = fromPromise<MllpDuplex, { open: OpenConnection }>(
  ({ input, signal }) => input.open(signal)
);

/**
 * The live wire for one connection. Wraps {@link createConnection} (the read
 * loop, decoder, single-flight ACK deferred, and drop detection) as an actor:
 * `WRITE` drives one exchange and pipes its result to the caller's `settle`;
 * `onDrop` becomes a `DROP` sent up; cleanup (on `connected` exit) tears the
 * connection down. The exchange logic stays in `createConnection` — only its
 * ownership lives here, under the machine.
 */
const wire = fromCallback<WireEvent, WireInput>(
  ({ input, receive, sendBack }) => {
    const connection = createConnection({
      duplex: input.duplex,
      host: input.host,
      maxBufferedBytes: input.maxBufferedBytes,
      onDrop: (error) => sendBack({ error, type: "DROP" }),
      port: input.port,
    });

    // Run one exchange and pipe its outcome to the caller's `settle`. Single-flight
    // is released (`EXCHANGE_COMPLETE`) BEFORE the caller is settled: `sendBack` is processed
    // synchronously, so `connected.sending → ready` completes before the caller's
    // promise resolves — `await send()` then a fresh `send()` cannot race into
    // SEND_IN_PROGRESS. On a drop the wire is already stopped, so this EXCHANGE_COMPLETE is
    // harmlessly dropped and the DROP routing wins.
    const runExchange = async (request: WireEvent): Promise<void> => {
      try {
        const response = await connection.exchange({
          framed: request.framed,
          requestControlId: request.requestControlId,
          timeoutMs: request.timeoutMs,
        });
        sendBack({ type: "EXCHANGE_COMPLETE" });
        request.settle.resolve(response);
      } catch (error) {
        sendBack({ type: "EXCHANGE_COMPLETE" });
        request.settle.reject(error);
      }
    };

    receive((event) => {
      void runExchange(event);
    });

    // Cleanup is synchronous (XState stops the actor when `connected` is exited).
    // It rejects an in-flight send and closes the duplex; if the connection was
    // already dropped, its `dead` latch makes this a no-op.
    return () => {
      void connection.shutdown(
        new MllpClientError(
          MllpErrorCode.CLOSED,
          "close() was called while this message was still being sent, so the send did not complete. The message may or may not have been received; if it is not safe to resend blindly, confirm receipt before retrying."
        )
      );
    };
  }
);

const connectionMachine = setup({
  actions: {
    incrementAttempt: assign({ attempt: ({ context }) => context.attempt + 1 }),
    resetAttempt: assign({ attempt: 0 }),
  },
  actors: { open, wire },
  delays: {
    connectTimeout: ({ context }) => context.connectTimeoutMs,
    // Recomputed per `backingOff` entry (fresh jitter); `attempt` is 1-based
    // there (just incremented), so the first retry is immediate.
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
    connectDeferred: null,
    connectTimeoutMs: input.connectTimeoutMs,
    duplex: null,
    host: input.host,
    maxBufferedBytes: input.maxBufferedBytes,
    open: input.open,
    options: input.options,
    port: input.port,
  }),
  id: "mllp-connection",
  initial: "idle",
  // Illegal SEND/CONNECT have ONE home. These machine-root transitions are the
  // DEFAULT answer (reject with the typed error), and a state overrides them only
  // where its answer differs: `idle` allows CONNECT, `connected.ready` allows SEND,
  // `connected.sending` answers SEND_IN_PROGRESS, and `closed` answers CLOSED.
  // XState's "deepest matching transition wins" makes the table read as
  // "the default, plus the exceptions" instead of one handler per state.
  on: {
    CONNECT: {
      actions: ({ event }) =>
        event.settle.reject(MllpClientError.alreadyConnected()),
    },
    SEND: {
      actions: ({ event }) =>
        event.settle.reject(MllpClientError.notConnected()),
    },
  },
  // States below are alphabetical for sort-keys; the lifecycle order is
  // idle → connecting → connected → backingOff → connecting → … → closed.
  states: {
    backingOff: {
      after: { retryDelay: "connecting" },
      entry: "incrementAttempt",
      // SEND → NOT_CONNECTED and CONNECT → ALREADY_CONNECTED come from the root.
      on: {
        CLOSE: {
          actions: [
            ({ context }) =>
              context.connectDeferred?.reject(
                MllpClientError.connectionAborted()
              ),
            assign({ connectDeferred: null }),
          ],
          target: "closed",
        },
      },
    },

    closed: {
      on: {
        CONNECT: {
          actions: ({ event }) => event.settle.reject(MllpClientError.closed()),
        },
        SEND: {
          actions: ({ event }) => event.settle.reject(MllpClientError.closed()),
        },
      },
    },

    connected: {
      entry: [
        "resetAttempt",
        ({ context }) => context.connectDeferred?.resolve(),
        assign({ connectDeferred: null }),
      ],
      initial: "ready",
      invoke: {
        id: "wire",
        input: ({ context }) => {
          if (context.duplex === null) {
            throw new Error(
              "Internal invariant: `connected` entered without an open duplex."
            );
          }
          return {
            duplex: context.duplex,
            host: context.host,
            maxBufferedBytes: context.maxBufferedBytes,
            port: context.port,
          };
        },
        src: "wire",
      },
      // CONNECT → ALREADY_CONNECTED comes from the root.
      on: {
        CLOSE: "closed",
        DROP: [
          { guard: "canRetry", target: "backingOff" },
          { target: "closed" },
        ],
      },
      states: {
        ready: {
          on: {
            SEND: {
              actions: sendTo("wire", ({ event }) => ({
                framed: event.framed,
                requestControlId: event.requestControlId,
                settle: event.settle,
                timeoutMs: event.timeoutMs,
                type: "WRITE" as const,
              })),
              target: "sending",
            },
          },
        },
        sending: {
          on: {
            EXCHANGE_COMPLETE: "ready",
            SEND: {
              actions: ({ event }) =>
                event.settle.reject(MllpClientError.sendInProgress()),
            },
          },
        },
      },
    },

    connecting: {
      after: {
        connectTimeout: [
          { guard: "canRetry", target: "backingOff" },
          {
            actions: [
              ({ context }) =>
                context.connectDeferred?.reject(
                  MllpClientError.connectionTimeout(context.connectTimeoutMs)
                ),
              assign({ connectDeferred: null }),
            ],
            target: "closed",
          },
        ],
      },
      invoke: {
        input: ({ context }) => ({ open: context.open }),
        onDone: {
          actions: assign({ duplex: ({ event }) => event.output }),
          target: "connected",
        },
        onError: [
          { guard: "canRetry", target: "backingOff" },
          {
            actions: [
              ({ context, event }) =>
                context.connectDeferred?.reject(
                  MllpClientError.connectionFailure(event.error)
                ),
              assign({ connectDeferred: null }),
            ],
            target: "closed",
          },
        ],
        src: "open",
      },
      // SEND → NOT_CONNECTED and CONNECT → ALREADY_CONNECTED come from the root.
      on: {
        CLOSE: {
          actions: [
            ({ context }) =>
              context.connectDeferred?.reject(
                MllpClientError.connectionAborted()
              ),
            assign({ connectDeferred: null }),
          ],
          target: "closed",
        },
      },
    },

    idle: {
      // SEND → NOT_CONNECTED comes from the root.
      on: {
        CLOSE: "closed",
        CONNECT: {
          actions: assign({ connectDeferred: ({ event }) => event.settle }),
          target: "connecting",
        },
      },
    },
  },
});

/** A started connection-lifecycle instance. Send it events; await via `settle`. */
export type ConnectionState = Actor<typeof connectionMachine>;

/** Create and start a connection-lifecycle instance (keeps XState behind here). */
export function createConnectionState(
  input: ConnectionStateInput
): ConnectionState {
  const actor = createActor(connectionMachine, { input });
  actor.start();
  return actor;
}
