/**
 * The bidirectional byte-stream contract that runtime adapters satisfy.
 *
 * @module
 */

/**
 * Bidirectional byte stream contract that runtime adapters must satisfy.
 *
 * **Adapter responsibilities** (the client trusts these and does not
 * defend against violations — adapter tests enforce them):
 *
 * - `close()` MUST resolve (never reject) and MUST be idempotent. The client
 *   awaits `close()` in `finally` blocks and fires-and-forgets from abort
 *   handlers.
 * - `closed` MUST resolve when either side ends the connection (peer drop,
 *   explicit close, error). It must not reject.
 */
export interface MllpDuplex {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
  readonly closed: Promise<void>;
}

export type MllpConnector = (opts: {
  host: string;
  port: number;
  signal: AbortSignal;
}) => Promise<MllpDuplex>;
