/**
 * In-memory MLLP wire for the client suite and canary: an
 * {@link MllpDuplex} whose read side answers every complete inbound frame
 * with an AA ACK echoing the message's MSH-10. Deterministic and CPU-bound.
 */
import { c, f, m, s } from "@glion/builder";
import type { MllpConnector, MllpDuplex } from "@glion/mllp-client";
import { frame } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const FS = 0x1c;
const CR = 0x0d;

function ackFrameFor(payload: Uint8Array): Uint8Array {
  // Only the MSH segment is parsed (bytes up to the first CR): the wire runs
  // inside the measured client round-trip, so its cost must stay constant
  // in message size rather than re-parsing the full payload.
  const crIndex = payload.indexOf(CR);
  const msh = crIndex === -1 ? payload : payload.subarray(0, crIndex);
  const controlId =
    value(parseHL7v2(TEXT_DECODER.decode(msh)), "MSH-10")?.value ?? "";
  const ack = m(
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f("RecvApp"),
      f("RecvFac"),
      f("SendApp"),
      f("SendFac"),
      f("20240101120000"),
      f(""),
      f(c("ACK"), c("A01")),
      f("ACK0001"),
      f("P"),
      f("2.5.1")
    ),
    s("MSA", f("AA"), f(controlId))
  );
  return frame(TEXT_ENCODER.encode(toHl7v2(ack)));
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
      // End-of-chunk check only — no cross-chunk trailer scan. Safe here
      // because the client hands the whole framed request to a single
      // writer.write() (connection.ts) and this duplex is in-memory: chunks
      // arrive exactly as written, never split by a socket. If that contract
      // ever changed, no ACK would be enqueued and the canary would hang
      // loudly rather than pass on garbage.
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
