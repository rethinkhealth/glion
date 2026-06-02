/**
 * The `MllpClient` class — persistent MLLP client for HL7v2. One send is on the
 * wire at a time; concurrent sends queue (FIFO) and run one after another.
 *
 * This is a thin facade: it gives consumers `instanceof MllpClient`,
 * constructor semantics, and a stable method surface, then delegates to the
 * connection manager (./manager.ts), which owns the state machine, the send
 * queue, the dial routine, and the per-connection wire layer. Keeping the
 * orchestration in a factory + closures (not the class) follows CLAUDE.md §4.
 *
 * @module
 */

import type { MllpConnector } from "./duplex";
import { createConnectionManager } from "./manager";
import type {
  ConnectionManager,
  MllpClientState,
  MllpSendOptions,
} from "./manager";
import { NO_RECONNECT } from "./reconnect";
import type { MllpClientResponse } from "./response";
import { toTree } from "./send";
import type { SendInput } from "./send";

export type { MllpClientState, MllpSendOptions } from "./manager";

export interface MllpClientOptions {
  readonly host: string;
  readonly port: number;
  /** Runtime adapter; e.g. `connectNode` from `@glion/mllp-client/node`. */
  readonly connect: MllpConnector;
  /** Default 30 000 ms. */
  readonly connectTimeoutMs?: number;
  /** Default 30 000 ms. Per-send `timeoutMs` overrides. */
  readonly sendTimeoutMs?: number;
  /**
   * Maximum bytes buffered while decoding inbound ACK frames. Defence
   * against peers that send unterminated data. Default 16 MiB.
   */
  readonly maxBufferedBytes?: number;
}

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_SEND_TIMEOUT_MS = 30_000;

export class MllpClient {
  readonly #manager: ConnectionManager;

  constructor(opts: MllpClientOptions) {
    // Reconnect is disabled for now, so a drop goes straight to `closed` — the
    // client's existing behaviour. Enabling reconnect is a follow-up that wires
    // the machine's backingOff/reconnecting states to a redial.
    this.#manager = createConnectionManager({
      connect: opts.connect,
      connectTimeoutMs: opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      host: opts.host,
      maxBufferedBytes: opts.maxBufferedBytes,
      policy: NO_RECONNECT,
      port: opts.port,
      sendTimeoutMs: opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS,
    });
  }

  /** Target host the client is configured for. Useful in error logs. */
  get host(): string {
    return this.#manager.host;
  }

  /** Target port the client is configured for. Useful in error logs. */
  get port(): number {
    return this.#manager.port;
  }

  get state(): MllpClientState {
    return this.#manager.state;
  }

  /** True when ready or sending — i.e., the wire is up. */
  get connected(): boolean {
    return this.#manager.connected;
  }

  /**
   * Number of sends waiting in the queue, excluding the one currently on the
   * wire. Fire three concurrent sends on a ready client and this reads `2`.
   */
  get queueDepth(): number {
    return this.#manager.queueDepth;
  }

  /**
   * Open the wire through the runtime adapter and start the read loop.
   * Single-shot: each instance manages one connection lifecycle. A hung dial is
   * bounded by `connectTimeoutMs`; cancel a connecting client with `close()`.
   *
   * @throws {MllpClientError} `CLOSED` when the instance is already `closed`
   *   (construct a new instance); `ALREADY_CONNECTED` when called while
   *   `connecting`/`connected`; `CONNECT_FAILED` when the adapter rejects
   *   (underlying error on `cause`); `CONNECT_TIMEOUT` when the adapter exceeds
   *   `connectTimeoutMs` (`timeoutMs` set); `CONNECT_ABORTED` when `close()`
   *   interrupts an in-flight connect.
   */
  connect(): Promise<void> {
    return this.#manager.connect();
  }

  /**
   * Frame and enqueue `message`, then resolve with the parsed ACK. Concurrent
   * sends queue (FIFO) and run one at a time. There is no caller cancellation
   * signal — a send is bounded by its ACK deadline, and `close()` rejects an
   * in-flight or queued send.
   *
   * @param opts.timeoutMs - Overrides the default ACK-wait deadline. The clock
   *   starts when the send reaches the wire, so a send waiting behind others
   *   may wait longer than this before its deadline begins.
   * @throws {AckException} (from `@glion/ack`) The peer returned a NAK — the
   *   subclass encodes the code: `AckApplicationError`/`AckApplicationReject`/
   *   `AckCommitError`/`AckCommitReject` for AE/AR/CE/CR.
   * @throws {MllpClientError} Otherwise; branch on `code`:
   *   `CORRELATION_MISMATCH` (request MSH-10 and response MSA-2 both non-empty
   *   and differ), `SEND_TIMEOUT` (no ACK in time), `DROPPED` (connection
   *   ended; `reason` discriminates — terminal), `NOT_CONNECTED`/`CLOSED`
   *   (state guard), `PARSE_FAILED`/`UNKNOWN_ACK_CODE` (ACK unparseable or
   *   non-standard MSA-1). Reading the request's MSH-10 is best-effort and
   *   never throws.
   * @throws {FramingError} The message carries an embedded MLLP framing byte
   *   (VT or FS) that cannot be framed. CR is allowed (segment terminator).
   */
  send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    // The client boundary: a `string` is parsed to a tree here, once. Past this
    // point the manager and everything internal work on a `Root`.
    return this.#manager.send(toTree(message), opts);
  }

  /**
   * Tear the connection down. Idempotent: resolves from any state and never
   * rejects. The in-flight `send()` rejects with `MllpClientError` (`CLOSED`),
   * as does every queued send.
   */
  close(): Promise<void> {
    return this.#manager.close();
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
