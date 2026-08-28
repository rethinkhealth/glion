/**
 * `createFakeDuplex` — an in-memory {@link MllpDuplex} for tests.
 *
 * Tests can:
 *
 * - Configure an `onWrite` callback that observes each write the client makes,
 *   and (typically) calls `injectPeerBytes()` to simulate the peer's ACK.
 * - Call `closePeer()` to simulate a peer drop.
 * - Inspect captured writes via `capturedWrites()`.
 *
 * Honours the `MllpDuplex` contract: `close()` resolves idempotently
 * and `closed` resolves whenever either side ends the connection.
 */

import type { MllpDuplex } from "../src/index";

export interface FakeDuplex {
  readonly duplex: MllpDuplex;
  injectPeerBytes(chunk: Uint8Array | string): void;
  closePeer(): void;
  capturedWrites(): Uint8Array;
  /** Number of times `close()` was called on the duplex. */
  closeCount(): number;
}

export interface FakeDuplexOptions {
  /**
   * Called synchronously when the client writes a chunk to the duplex.
   * Typically used to inject the peer's ACK in response.
   */
  onWrite?: (chunk: Uint8Array, fake: FakeDuplex) => void | Promise<void>;
  /**
   * If set, the writable's `write()` rejects with this error.
   * Used for "write fails" tests.
   */
  writeError?: Error;
}

const ENCODER = new TextEncoder();

export function createFakeDuplex(opts: FakeDuplexOptions = {}): FakeDuplex {
  const written: Uint8Array[] = [];

  let readableController: ReadableStreamDefaultController<Uint8Array> | null =
    null;
  let readableClosed = false;

  let resolveClosed: (() => void) | null = null;
  // oxlint-disable-next-line promise/avoid-new -- Deferred-style closure
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  let closeCalls = 0;
  let closePromise: Promise<void> | null = null;

  const readable = new ReadableStream<Uint8Array>({
    cancel() {
      readableClosed = true;
    },
    start(controller) {
      readableController = controller;
    },
  });

  // eslint-disable-next-line prefer-const
  let fake: FakeDuplex;

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (opts.writeError) {
        throw opts.writeError;
      }
      written.push(chunk);
      if (opts.onWrite) {
        await opts.onWrite(chunk, fake);
      }
    },
  });

  const close = (): Promise<void> => {
    closeCalls += 1;
    if (closePromise !== null) {
      return closePromise;
    }
    closePromise = (async () => {
      if (!readableClosed) {
        readableClosed = true;
        try {
          readableController?.close();
        } catch {
          // already closed
        }
      }
      try {
        await writable.close();
      } catch {
        // already closed / errored
      }
      resolveClosed?.();
    })();
    return closePromise;
  };

  const duplex: MllpDuplex = { close, closed, readable, writable };

  fake = {
    capturedWrites() {
      let total = 0;
      for (const c of written) {
        total += c.length;
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of written) {
        out.set(c, off);
        off += c.length;
      }
      return out;
    },
    closeCount() {
      return closeCalls;
    },
    closePeer() {
      if (readableClosed) {
        return;
      }
      readableClosed = true;
      try {
        readableController?.close();
      } catch {
        // already closed
      }
      resolveClosed?.();
    },
    duplex,
    injectPeerBytes(chunk) {
      if (readableClosed) {
        return;
      }
      const bytes = typeof chunk === "string" ? ENCODER.encode(chunk) : chunk;
      readableController?.enqueue(bytes);
    },
  };

  return fake;
}
