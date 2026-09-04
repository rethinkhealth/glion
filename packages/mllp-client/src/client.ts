/**
 * `MllpClient`: one connection, one message on the wire at a time.
 *
 * The class is the public surface and nothing more — it validates its
 * options, encodes the message, and hands three commands to the actor in
 * `actor.ts`, which owns every piece of lifecycle state. This is the only
 * layer that consumers see, and `actor.ts` is the only layer that decides.
 *
 * @module
 */

import { createActor } from "./actor";
import type { Actor } from "./actor";
import { encode } from "./codec";
import type { EncodedMessage } from "./codec";
import { openFramedConnection } from "./connection";
import {
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_MAX_BUFFERED_BYTES,
  DEFAULT_SEND_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
} from "./constants";
import { MllpInvalidMessageError, MllpInvalidOptionError } from "./errors";
import type {
  MllpClientOptions,
  MllpClientResponse,
  MllpClientState,
  MllpSendOptions,
  SendInput,
} from "./types";

function assertTimeoutMs(option: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new MllpInvalidOptionError(
      option,
      `a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}`,
      ms
    );
  }
}

function assertByteCap(option: string, bytes: number): void {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new MllpInvalidOptionError(option, "a positive integer", bytes);
  }
}

/** `encode`, with the codec's failure wrapped as the client's error. */
function encodeMessage(message: SendInput): EncodedMessage {
  try {
    return encode(message);
  } catch (error) {
    throw new MllpInvalidMessageError(error);
  }
}

/**
 * Sends HL7v2 messages to one remote system over MLLP and returns each
 * message's acknowledgment.
 *
 * One client owns one TCP connection and sends one message at a time, which
 * is what the protocol requires: the next frame the remote system writes
 * after a message is that message's acknowledgment. `send()` writes the
 * message, waits for the acknowledgment, checks that it answers this message,
 * and resolves with it.
 *
 * ## Usage
 *
 * Send as many messages as needed, then close. `send()` connects on first
 * use; `connect()` opens the connection ahead of time when that is useful,
 * for example to fail fast at startup.
 *
 * ```ts
 * import { MllpClient } from "@glion/mllp-client";
 * import { connectNode } from "@glion/mllp-client/node";
 *
 * const client = new MllpClient({
 *   connect: connectNode,
 *   host: "hl7.example.org",
 *   port: 2575,
 * });
 *
 * await client.connect();
 * try {
 *   const ack = await client.send(adtMessage); // HL7v2 text, or a parsed Root
 *   ack.code; // "AA" or "CA": the remote system accepted the message
 * } finally {
 *   await client.close();
 * }
 * ```
 *
 * Or scope the client to a block with `await using`:
 *
 * ```ts
 * await using client = new MllpClient({
 *   connect: connectNode,
 *   host,
 *   port,
 * });
 * const ack = await client.send(adtMessage);
 * ```
 *
 * ## Lifecycle
 *
 * ```text
 * idle → connecting → connected ⇄ sending → closed
 * ```
 *
 * `state` reports the current phase. A client closes once and never
 * reconnects: after `close()`, or after a failure that ends the connection,
 * every call rejects with {@link MllpClientClosedError}, and a new client is
 * the way back.
 *
 * ## Errors
 *
 * A NAK is not an error of the client. When the remote system answers with
 * `AE`, `AR`, `CE`, or `CR`, `send()` rejects with the matching
 * `@glion/ack` exception, and the connection stays open.
 *
 * Everything the client itself raises extends {@link MllpClientError}. Each
 * subclass is one situation, each carries a stable `code`, and each carries
 * `delivery`: `not-sent` when nothing reached the wire, `unknown` when the
 * message may have been received. The failures that can happen after the
 * message is written, a timeout, a lost connection, or an unusable reply,
 * also close the client, because acknowledgments on that connection can no
 * longer be matched safely.
 *
 * ```ts
 * import { AckException } from "@glion/ack";
 * import { MllpClientError } from "@glion/mllp-client";
 *
 * try {
 *   await client.send(adtMessage);
 * } catch (error) {
 *   if (error instanceof AckException) {
 *     // The remote system understood the message and rejected it.
 *     // The connection is still open; error.text carries its reason.
 *   } else if (error instanceof MllpClientError) {
 *     // The client or the wire failed. error.code says what happened, and
 *     // error.delivery says whether the message may have been received.
 *   }
 * }
 * ```
 *
 * ## Runtimes
 *
 * The client speaks to the network through the `connect` option, an
 * {@link MllpConnector} that opens one connection as a pair of byte streams.
 * The Node adapter ships as `@glion/mllp-client/node`; other runtimes
 * implement the same small interface.
 */
export class MllpClient {
  readonly #endpoint: { readonly host: string; readonly port: number };
  readonly #sendTimeoutMs: number;
  readonly #actor: Actor;

  /** @throws {MllpInvalidOptionError} A timeout or byte cap is out of range. */
  constructor(opts: MllpClientOptions) {
    const connectTimeoutMs =
      opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    const maxBufferedBytes =
      opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
    this.#sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;

    assertTimeoutMs("connectTimeoutMs", connectTimeoutMs);
    assertTimeoutMs("sendTimeoutMs", this.#sendTimeoutMs);
    assertByteCap("maxBufferedBytes", maxBufferedBytes);

    this.#endpoint = { host: opts.host, port: opts.port };
    this.#actor = createActor({
      connectTimeoutMs,
      openFramedConnection: (signal) =>
        openFramedConnection({
          connect: opts.connect,
          host: opts.host,
          maxBufferedBytes,
          port: opts.port,
          signal,
        }),
    });
  }

  /** Host name or address of the remote system. */
  get host(): string {
    return this.#endpoint.host;
  }

  /** TCP port of the remote system. */
  get port(): number {
    return this.#endpoint.port;
  }

  /**
   * The current phase of the client's lifecycle.
   *
   * `idle` before the first `connect()`, `connecting` while an attempt is in
   * flight, `connected` while the connection is open and free, `sending`
   * while a message is waiting for its acknowledgment, and `closed` once the
   * client is done, whether by `close()` or by a failure. Useful for logging
   * and health checks; the methods enforce it themselves.
   */
  get state(): MllpClientState {
    return this.#actor.state;
  }

  /**
   * Whether the connection is open. True in both `connected` and `sending`.
   */
  get connected(): boolean {
    const { state } = this.#actor;
    return state === "connected" || state === "sending";
  }

  /**
   * Open the connection ahead of the first `send()`, which would otherwise
   * open it. Idempotent: a connected client resolves at once, and a call that
   * arrives while an attempt is in flight waits for that attempt.
   *
   * @throws {MllpConnectFailedError} The connection could not be opened.
   * @throws {MllpConnectTimeoutError} The connection did not open in time.
   * @throws {MllpConnectAbortedError} `close()` arrived first.
   * @throws {MllpClientClosedError} The client is already closed.
   */
  connect(): Promise<void> {
    return this.#actor.connect();
  }

  /**
   * Send one message and return its acknowledgment. Connects first when the
   * client is not connected yet.
   *
   * Nothing is written when an option, state, or message error is thrown.
   * Every other failure also closes the client, because the connection can no
   * longer be trusted to be in step; check `delivery` before sending the
   * message again.
   *
   * @throws {AckException} The remote system answered with a NAK. The
   *   connection stays open.
   * @throws {MllpInvalidOptionError} `timeoutMs` is out of range.
   * @throws {MllpClientClosedError} The client is closed.
   * @throws {MllpAlreadySendingError} Another send is in flight.
   * @throws {MllpInvalidMessageError} The message cannot be sent as-is.
   * @throws {MllpSendTimeoutError} No acknowledgment arrived in time.
   * @throws {MllpDroppedError} The connection was lost.
   * @throws {MllpInvalidResponseError} The reply is not a usable
   *   acknowledgment.
   */
  send(
    message: SendInput,
    opts: MllpSendOptions = {}
  ): Promise<MllpClientResponse> {
    try {
      const timeoutMs = opts.timeoutMs ?? this.#sendTimeoutMs;
      assertTimeoutMs("timeoutMs", timeoutMs);
      return this.#actor.send(encodeMessage(message), timeoutMs);
    } catch (error) {
      // An option or message failure arrives the way every other send()
      // failure does — as a rejection, never a throw at the call site.
      return Promise.reject(error);
    }
  }

  /**
   * End the connection. Resolves from any phase, never rejects, and resolves
   * once the connection is actually closed. An in-flight `send()` rejects
   * with {@link MllpClientClosedError}.
   */
  close(): Promise<void> {
    return this.#actor.close();
  }

  /** Calls {@link close}. Enables `await using`. */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}
