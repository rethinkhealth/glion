/**
 * The one owner of the client's state.
 *
 * Everything that can change the client is a {@link Message}, and every
 * message goes through `handle`, a synchronous function draining a FIFO
 * mailbox run-to-completion. `handle` is not `async` by signature, so it
 * cannot yield mid-decision: an accidental `await` inside it is a type error.
 * That is the whole concurrency argument — there is exactly one writer of
 * `state`, and it never pauses between reading a phase and replacing it.
 *
 * The rule the compiler only half-enforces, and the one review has to keep
 * honest: **an effect never touches the state — it posts a fact.** The three
 * `run*` functions below are the only async code in this module, they are
 * started with `void`, and each ends in `post()`. A fact that arrives while
 * the mailbox is draining simply queues behind the message being handled,
 * which is why an effect that fails synchronously is safe.
 *
 * Facts about one exchange carry the `seq` of the send they belong to. A fact
 * whose `seq` no longer matches the message on the connection is a straggler
 * from a send that is already over, and is dropped — that is what makes a late
 * acknowledgment, a released reader, or a fired-but-overtaken timer harmless
 * instead of a race.
 *
 * @module
 */

import { MllpCodecError } from "@glion/mllp-codec";

import { decode } from "./codec";
import type { EncodedMessage } from "./codec";
import type { FramedConnection } from "./connection";
import {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpConnectAbortedError,
  MllpConnectFailedError,
  MllpConnectTimeoutError,
  MllpDroppedError,
  MllpInvalidResponseError,
  MllpSendTimeoutError,
} from "./errors";
import type { MllpClientError } from "./errors";
import type { MllpClientResponse, MllpClientState } from "./types";

// ── Vocabulary ────────────────────────────────────────────────────────
/** What `setTimeout` returns, named so the state union reads on one line. */
type Timer = ReturnType<typeof setTimeout>;

// ── Replies ───────────────────────────────────────────────────────────

/**
 * A promise the actor holds until it decides the answer. Every command
 * carries one, so a handler settles its caller at the decision site instead
 * of returning a value up an async chain.
 */
interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  // Assigned by the executor below, which the Promise constructor is
  // specified to run before it returns.
  let settle!: (value: T | PromiseLike<T>) => void;
  let fail!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new -- Promise.withResolvers needs Node 22; this package supports Node 20.
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  // Every reply is returned to a caller by the `MllpClient` method that
  // created it, so it always ends up handled — but the actor settles replies
  // eagerly, and a caller that awaits something else first (`close()`, say)
  // may not attach until a later turn. This marks the rejection handled so
  // that window is not reported as an unhandled rejection. It suppresses no
  // error: the caller still receives it.
  // oxlint-disable-next-line promise/prefer-await-to-then -- marks it handled; does not consume it
  promise.catch(alreadyReported);
  return { promise, reject: fail, resolve: settle };
}

/** Handles nothing. See the note in {@link deferred}. */
function alreadyReported(): void {
  // Deliberately empty.
}

/** A `Deferred` that is already settled, for a teardown with nothing to do. */
function settled(): Deferred<void> {
  const done = deferred();
  done.resolve();
  return done;
}

// ── The parts a phase is made of ──────────────────────────────────────

/** A send that arrived before the connection was open, waiting for it. */
interface Queued {
  readonly message: EncodedMessage;
  readonly timeoutMs: number;
  readonly reply: Deferred<MllpClientResponse>;
}

/**
 * The message on the connection. `seq` is its identity: every fact an effect
 * posts carries the `seq` it belongs to, so a straggler from a send that is
 * already over is recognised and dropped rather than applied to its successor.
 */
interface Pending {
  readonly seq: number;
  readonly controlId: string;
  readonly timeoutMs: number;
  readonly reply: Deferred<MllpClientResponse>;
  readonly timer: Timer;
}

// ── The phases ────────────────────────────────────────────────────────

type State =
  | { readonly phase: "idle" }
  | {
      readonly phase: "connecting";
      /** Cancels the connector when a deadline or `close()` gives up on it. */
      readonly abort: AbortController;
      readonly timer: Timer;
      /** `connect()` callers waiting for this attempt. */
      readonly waiters: readonly Deferred<void>[];
      /** The send that started the attempt, when a send did. */
      readonly queued: Queued | null;
    }
  | {
      readonly phase: "connected";
      readonly connection: FramedConnection;
      /** The message on the connection, or `null` when the connection is free. */
      readonly pending: Pending | null;
    }
  | {
      readonly phase: "closed";
      /** Why the client closed; `null` for an owner `close()`. */
      readonly reason: MllpClientError | null;
      /**
       * Settled once the connection is disposed of, which every `close()`
       * resolves with. Left unsettled while a connection that may still arrive
       * is outstanding; the straggler that delivers it settles this.
       */
      readonly teardown: Deferred<void>;
    };

type Connecting = Extract<State, { phase: "connecting" }>;
type Connected = Extract<State, { phase: "connected" }>;
/** A connected client with a message on the connection. */
type Sending = Connected & { readonly pending: Pending };

// ── The messages ──────────────────────────────────────────────────────

/**
 * Everything that can change the state, and the only thing that does.
 *
 * Three **commands** are what the client's methods ask for; each carries the
 * reply its caller is waiting on. Seven **facts** are what an effect reports
 * back once it has finished: an effect never touches the state itself. A write
 * that succeeds posts nothing — the acknowledgment is the only success worth
 * reporting.
 */
type Message =
  // Commands.
  | { readonly type: "connect"; readonly reply: Deferred<void> }
  | {
      readonly type: "send";
      readonly message: EncodedMessage;
      readonly timeoutMs: number;
      readonly reply: Deferred<MllpClientResponse>;
    }
  | { readonly type: "close"; readonly reply: Deferred<void> }
  // Facts: opening the connection.
  | { readonly type: "connectionOpen"; readonly connection: FramedConnection }
  | { readonly type: "connectionFailed"; readonly cause: unknown }
  | { readonly type: "connectDeadline" }
  // Facts: the exchange.
  | {
      readonly type: "writeFailed";
      readonly seq: number;
      readonly cause: unknown;
    }
  | { readonly type: "frame"; readonly seq: number; readonly bytes: Uint8Array }
  | { readonly type: "eof"; readonly seq: number }
  | {
      readonly type: "readFailed";
      readonly seq: number;
      readonly cause: unknown;
    }
  | { readonly type: "sendDeadline"; readonly seq: number };

/** How every effect reports back. */

// ── The actor ─────────────────────────────────────────────────────────

export interface ActorOptions {
  /** Opens one connection, cancelled through `signal`. */
  readonly openFramedConnection: (
    signal: AbortSignal
  ) => Promise<FramedConnection>;
  readonly connectTimeoutMs: number;
}

/** What `MllpClient` delegates to: the same three operations, plus the phase. */
export interface Actor {
  readonly state: MllpClientState;
  connect(): Promise<void>;
  send(message: EncodedMessage, timeoutMs: number): Promise<MllpClientResponse>;
  close(): Promise<void>;
}

export function createActor(opts: ActorOptions): Actor {
  let state: State = { phase: "idle" };
  const mailbox: Message[] = [];
  let draining = false;
  let sequence = 0;

  /**
   * The only entry point. Appends to the mailbox, and drains it unless a
   * drain is already running — the latch is what makes the drain
   * run-to-completion, and what lets an effect post from inside a handler.
   */
  function post(message: Message): void {
    mailbox.push(message);
    if (draining) {
      return;
    }
    draining = true;
    try {
      for (
        let next = mailbox.shift();
        next !== undefined;
        next = mailbox.shift()
      ) {
        handle(next);
      }
    } finally {
      // Released even when a handler threw, so a violated invariant surfaces
      // as that throw instead of wedging the mailbox.
      draining = false;
    }
  }

  // ── Effects ─────────────────────────────────────────────────────────
  // Async, started with `void`, and reporting only by posting a fact. None of
  // them reads or writes `state`.

  async function runOpen(signal: AbortSignal): Promise<void> {
    try {
      post({
        connection: await opts.openFramedConnection(signal),
        type: "connectionOpen",
      });
    } catch (error) {
      post({ cause: error, type: "connectionFailed" });
    }
  }

  async function runWrite(
    connection: FramedConnection,
    seq: number,
    framed: Uint8Array
  ): Promise<void> {
    try {
      await connection.write(framed);
    } catch (error) {
      post({ cause: error, seq, type: "writeFailed" });
    }
  }

  async function runRead(
    connection: FramedConnection,
    seq: number
  ): Promise<void> {
    try {
      const bytes = await connection.read();
      post(
        bytes === null ? { seq, type: "eof" } : { bytes, seq, type: "frame" }
      );
    } catch (error) {
      post({ cause: error, seq, type: "readFailed" });
    }
  }

  // ── Transitions the handlers share ──────────────────────────────────

  /** The send this fact belongs to, or `null` when it is a straggler. */
  function sendingFor(seq: number): Sending | null {
    if (state.phase !== "connected" || state.pending?.seq !== seq) {
      return null;
    }
    return { ...state, pending: state.pending };
  }

  /** Starts an attempt, with whoever is waiting for it. */
  function startConnecting(waiting: {
    waiters: readonly Deferred<void>[];
    queued: Queued | null;
  }): void {
    const abort = new AbortController();
    const timer = setTimeout(
      () => post({ type: "connectDeadline" }),
      opts.connectTimeoutMs
    );
    state = {
      abort,
      phase: "connecting",
      queued: waiting.queued,
      timer,
      waiters: waiting.waiters,
    };
    void runOpen(abort.signal);
  }

  /** Ends an attempt, telling everyone waiting on it why. */
  function endAttempt(
    attempt: Connecting,
    errors: { waiters: MllpClientError; queued: MllpClientError },
    reason: MllpClientError | null,
    teardown: Deferred<void>
  ): void {
    clearTimeout(attempt.timer);
    attempt.abort.abort();
    for (const waiter of attempt.waiters) {
      waiter.reject(errors.waiters);
    }
    attempt.queued?.reply.reject(errors.queued);
    state = { phase: "closed", reason, teardown };
  }

  /** Puts a message on the connection and starts waiting for its acknowledgment. */
  function beginSend(open: Connected, queued: Queued): void {
    sequence += 1;
    const seq = sequence;
    state = {
      ...open,
      pending: {
        controlId: queued.message.controlId,
        reply: queued.reply,
        seq,
        timeoutMs: queued.timeoutMs,
        timer: setTimeout(
          () => post({ seq, type: "sendDeadline" }),
          queued.timeoutMs
        ),
      },
    };
    void runWrite(open.connection, seq, queued.message.framed);
    // Read now rather than after the write lands: MLLP is lockstep, so the
    // next frame is this message's acknowledgment however fast it arrives.
    void runRead(open.connection, seq);
  }

  /**
   * The only path that ends a live connection with a connection-layer failure,
   * and it always ends it. After a late, lost, or unreadable frame the
   * connection is no longer known to be in step, and reading on would risk
   * taking a stray frame as the next message's acknowledgment — a message
   * reported as accepted that never was.
   */
  function fail(open: Sending, error: MllpClientError): void {
    clearTimeout(open.pending.timer);
    open.pending.reply.reject(error);
    const teardown = deferred();
    state = { phase: "closed", reason: error, teardown };
    teardown.resolve(open.connection.close());
  }

  /** The acknowledgment settled the send; the connection stays open. */
  function concludeSend(open: Sending, settle: () => void): void {
    clearTimeout(open.pending.timer);
    settle();
    state = { ...open, pending: null };
  }

  function closedError(reason: MllpClientError | null): MllpClientClosedError {
    return new MllpClientClosedError(reason ?? undefined);
  }

  // ── Commands ────────────────────────────────────────────────────────

  function onConnect(reply: Deferred<void>): void {
    switch (state.phase) {
      case "idle": {
        startConnecting({ queued: null, waiters: [reply] });
        break;
      }
      case "connecting": {
        state = { ...state, waiters: [...state.waiters, reply] };
        break;
      }
      case "connected": {
        reply.resolve();
        break;
      }
      case "closed": {
        reply.reject(closedError(state.reason));
        break;
      }
    }
  }

  function onSend(
    message: EncodedMessage,
    timeoutMs: number,
    reply: Deferred<MllpClientResponse>
  ): void {
    const queued: Queued = { message, reply, timeoutMs };
    switch (state.phase) {
      case "idle": {
        startConnecting({ queued, waiters: [] });
        break;
      }
      case "connecting": {
        if (state.queued === null) {
          state = { ...state, queued };
        } else {
          reply.reject(
            new MllpAlreadySendingError(state.queued.message.controlId)
          );
        }
        break;
      }
      case "connected": {
        if (state.pending === null) {
          beginSend(state, queued);
        } else {
          reply.reject(new MllpAlreadySendingError(state.pending.controlId));
        }
        break;
      }
      case "closed": {
        reply.reject(closedError(state.reason));
        break;
      }
    }
  }

  function onClose(reply: Deferred<void>): void {
    switch (state.phase) {
      case "idle": {
        state = { phase: "closed", reason: null, teardown: settled() };
        reply.resolve();
        break;
      }
      case "connecting": {
        // Left unsettled: the connector may still hand us a connection, and
        // disposing of that is what this teardown is waiting for.
        const teardown = deferred();
        endAttempt(
          state,
          {
            queued: new MllpClientClosedError(undefined, "not-sent"),
            waiters: new MllpConnectAbortedError(),
          },
          null,
          teardown
        );
        reply.resolve(teardown.promise);
        break;
      }
      case "connected": {
        const { pending, connection } = state;
        if (pending !== null) {
          clearTimeout(pending.timer);
          pending.reply.reject(new MllpClientClosedError(undefined, "unknown"));
        }
        const teardown = deferred();
        state = { phase: "closed", reason: null, teardown };
        teardown.resolve(connection.close());
        reply.resolve(teardown.promise);
        break;
      }
      case "closed": {
        reply.resolve(state.teardown.promise);
        break;
      }
    }
  }

  // ── Facts: opening the connection ───────────────────────────────────

  function onConnectionOpen(connection: FramedConnection): void {
    switch (state.phase) {
      case "connecting": {
        clearTimeout(state.timer);
        const { queued, waiters } = state;
        const open: Connected = {
          connection,
          pending: null,
          phase: "connected",
        };
        state = open;
        for (const waiter of waiters) {
          waiter.resolve();
        }
        if (queued !== null) {
          beginSend(open, queued);
        }
        break;
      }
      case "closed": {
        // The connection opened after a deadline or a close() gave up on it.
        // Disposing of it is exactly what the closed teardown is waiting for.
        state.teardown.resolve(connection.close());
        break;
      }
      case "idle":
      case "connected": {
        // Unreachable: a connection is only ever opened from `connecting`, and the
        // only phases that attempt can reach are `connected` and `closed`.
        break;
      }
    }
  }

  function onConnectionFailed(cause: unknown): void {
    switch (state.phase) {
      case "connecting": {
        // Only a genuine connector failure reaches here. A deadline or a
        // close() would have moved the client to `closed` before aborting, so
        // there is no signal to interrogate and no reason to re-derive.
        const error = new MllpConnectFailedError(cause);
        endAttempt(state, { queued: error, waiters: error }, error, settled());
        break;
      }
      case "closed": {
        // The attempt we had already given up on is now finished failing;
        // there is no connection to dispose of.
        state.teardown.resolve();
        break;
      }
      case "idle":
      case "connected": {
        break;
      }
    }
  }

  function onConnectDeadline(): void {
    if (state.phase !== "connecting") {
      return; // a timer that fired after the attempt was already over
    }
    const error = new MllpConnectTimeoutError(opts.connectTimeoutMs);
    // Left unsettled: a connector that ignores the abort may still resolve.
    endAttempt(state, { queued: error, waiters: error }, error, deferred());
  }

  // ── Facts: the exchange ─────────────────────────────────────────────

  function onWriteFailed(seq: number, cause: unknown): void {
    const open = sendingFor(seq);
    if (open === null) {
      return;
    }
    fail(open, new MllpDroppedError(open.pending.controlId, "not-sent", cause));
  }

  function onFrame(seq: number, bytes: Uint8Array): void {
    const open = sendingFor(seq);
    if (open === null) {
      return;
    }
    const outcome = decode(bytes, open.pending.controlId);
    switch (outcome.kind) {
      case "accepted": {
        concludeSend(open, () => open.pending.reply.resolve(outcome.response));
        break;
      }
      case "rejected": {
        // A NAK is the remote system answering properly, so the connection is still
        // in step and the connection stays open.
        concludeSend(open, () => open.pending.reply.reject(outcome.exception));
        break;
      }
      case "invalid": {
        fail(
          open,
          new MllpInvalidResponseError(open.pending.controlId, outcome.cause)
        );
        break;
      }
    }
  }

  /** End of stream, or a read that failed: either way the connection is gone. */
  function onConnectionLost(seq: number, cause?: unknown): void {
    const open = sendingFor(seq);
    if (open === null) {
      return;
    }
    const { controlId } = open.pending;
    fail(
      open,
      cause instanceof MllpCodecError
        ? new MllpInvalidResponseError(controlId, cause)
        : new MllpDroppedError(controlId, "unknown", cause)
    );
  }

  function onSendDeadline(seq: number): void {
    const open = sendingFor(seq);
    if (open === null) {
      return;
    }
    fail(
      open,
      new MllpSendTimeoutError(open.pending.controlId, open.pending.timeoutMs)
    );
  }

  // ── Dispatch ────────────────────────────────────────────────────────

  function handle(message: Message): void {
    switch (message.type) {
      case "connect": {
        onConnect(message.reply);
        break;
      }
      case "send": {
        onSend(message.message, message.timeoutMs, message.reply);
        break;
      }
      case "close": {
        onClose(message.reply);
        break;
      }
      case "connectionOpen": {
        onConnectionOpen(message.connection);
        break;
      }
      case "connectionFailed": {
        onConnectionFailed(message.cause);
        break;
      }
      case "connectDeadline": {
        onConnectDeadline();
        break;
      }
      case "writeFailed": {
        onWriteFailed(message.seq, message.cause);
        break;
      }
      case "frame": {
        onFrame(message.seq, message.bytes);
        break;
      }
      case "eof": {
        onConnectionLost(message.seq);
        break;
      }
      case "readFailed": {
        onConnectionLost(message.seq, message.cause);
        break;
      }
      case "sendDeadline": {
        onSendDeadline(message.seq);
        break;
      }
    }
  }

  return {
    close(): Promise<void> {
      const reply = deferred();
      post({ reply, type: "close" });
      return reply.promise;
    },
    connect(): Promise<void> {
      const reply = deferred();
      post({ reply, type: "connect" });
      return reply.promise;
    },
    send(
      message: EncodedMessage,
      timeoutMs: number
    ): Promise<MllpClientResponse> {
      const reply = deferred<MllpClientResponse>();
      post({ message, reply, timeoutMs, type: "send" });
      return reply.promise;
    },
    get state(): MllpClientState {
      if (state.phase === "connected" && state.pending !== null) {
        return "sending";
      }
      return state.phase;
    },
  };
}
