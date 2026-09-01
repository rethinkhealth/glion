/**
 * In-memory MLLP wire for the client suite and canary: an
 * {@link MllpDuplex} whose read side answers every complete inbound frame
 * with an AA ACK echoing the message's MSH-10. Deterministic and CPU-bound.
 */
import type { MllpConnector, MllpDuplex } from "@glion/mllp-client";
import { frame } from "@glion/mllp-codec";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const FS = 0x1c;
const CR = 0x0d;

function ackFrameFor(payload: Uint8Array): Uint8Array {
  const controlId =
    TEXT_DECODER.decode(payload).split("\r")[0]?.split("|")[9] ?? "";
  const ack = `MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK^A01|ACK0001|P|2.5.1\rMSA|AA|${controlId}`;
  return frame(TEXT_ENCODER.encode(ack));
}

/**
 * The client writes one whole frame per send, so frame completion is
 * detected by the FS+CR trailer at the end of a write.
 */
export const connectInMemory: MllpConnector = (opts) => {
  opts.signal.throwIfAborted();

  let enqueueAck: ((ack: Uint8Array) => void) | undefined;
  let closeReadable: (() => void) | undefined;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      enqueueAck = (ack) => controller.enqueue(ack);
      closeReadable = () => controller.close();
    },
  });

  let pending: Uint8Array[] = [];
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      pending.push(chunk);
      const trailerComplete =
        chunk.length >= 2 && chunk.at(-2) === FS && chunk.at(-1) === CR;
      if (!trailerComplete) {
        return;
      }
      let total = 0;
      for (const part of pending) {
        total += part.length;
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const part of pending) {
        bytes.set(part, offset);
        offset += part.length;
      }
      pending = [];
      enqueueAck?.(ackFrameFor(bytes.subarray(1, -2)));
    },
  });

  let open = true;
  let resolveClosed: () => void;
  // oxlint-disable-next-line promise/avoid-new -- deferred settled by close()
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });

  const duplex: MllpDuplex = {
    // Contract: resolves (never rejects) and is idempotent.
    close() {
      if (open) {
        open = false;
        closeReadable?.();
        resolveClosed();
      }
      return Promise.resolve();
    },
    closed,
    readable,
    writable,
  };
  return Promise.resolve(duplex);
};
