/**
 * Public types for the runtime-free core of `@glion/mllp-client`.
 *
 * These types describe the shape of the pluggable transport that the
 * client uses to read and write bytes on the wire. The core does not
 * import any runtime-specific module — every connection is opened by
 * a {@link MllpConnect} function the caller supplies. Per-runtime
 * adapters (`@glion/mllp-client/node`, `/deno`, `/workers`) ship
 * pre-wired implementations so most callers never write a `connect`
 * function themselves.
 *
 * @module
 */

import type { MllpClientTlsOptions } from "./client";

/**
 * Connect to an MLLP receiver and return a {@link MllpDuplexStream}
 * over which the client will write the framed message and read the
 * acknowledgment.
 *
 * Implementations must:
 *
 * - Resolve once the underlying transport is ready for I/O (TCP `connect` has
 *   fired, or the TLS handshake has completed when `tls` is set).
 * - Reject with a thrown `Error` if the connection cannot be established. The
 *   client maps native errors into typed `MllpClientError` instances.
 * - Honour `signal` if the caller passes one — abort the connect attempt and
 *   reject when the signal aborts. Future revisions of the client may pass a
 *   signal here to enforce the connect-phase deadline.
 *
 * The returned duplex must remain usable until {@link MllpDuplexStream.close}
 * is called.
 */
export type MllpConnect = (
  params: MllpConnectParams
) => Promise<MllpDuplexStream>;

/**
 * Parameters supplied to a {@link MllpConnect} implementation.
 */
export interface MllpConnectParams {
  /** Hostname or IP of the receiver. */
  host: string;
  /** TCP port of the receiver. */
  port: number;
  /**
   * TLS configuration. When set, the connector should establish a TLS
   * connection (rather than plain TCP).
   */
  tls?: MllpClientTlsOptions;
  /**
   * Optional abort signal. Implementations should listen for `abort`
   * and tear the partial connection down so that the client's deadline
   * fires cleanly.
   */
  signal?: AbortSignal;
}

/**
 * A Web-Streams duplex over which the client reads and writes bytes.
 *
 * The runtime adapters wrap their native socket types into this shape.
 * The core has no awareness of the underlying transport — TCP, TLS,
 * a WebSocket bridge, or an in-memory pipe (for tests) all work
 * provided they expose Web Streams.
 */
export interface MllpDuplexStream {
  /** Inbound byte stream from the receiver. */
  readonly readable: ReadableStream<Uint8Array>;
  /** Outbound byte stream to the receiver. */
  readonly writable: WritableStream<Uint8Array>;
  /**
   * Tear the connection down. Idempotent. The client calls `close()`
   * from a `finally` block, so implementations must tolerate being
   * called after a previous `close()` (or after the underlying
   * transport has already gone away).
   */
  close(): void | Promise<void>;
}
