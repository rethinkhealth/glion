/**
 * Fixtures for `glion send` tests: a message, its acknowledgments, sockets
 * that answer in memory, and a stdout/stderr capture.
 *
 * @module
 */

import type { MllpSocket } from "@glion/mllp-client";
import { frame } from "@glion/mllp-codec";

/** An ADT^A01 with control ID `MSG00001`, CR-delimited. */
export const ADT = [
  "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260531120000||ADT^A01|MSG00001|P|2.5",
  "EVN|A01|20260531120000",
  "PID|1||12345^^^MRN||DOE^JOHN",
].join("\r");

/** An MLLP-framed acknowledgment of {@link ADT} with MSA-1 `code`. */
export function ackFrame(code: string, withErr = false): Uint8Array {
  const segments = [
    "MSH|^~\\&|RECEIVER|FAC|SENDER|FAC|20260531120001||ACK^A01|ACK00001|P|2.5",
    `MSA|${code}|MSG00001|the peer says hi`,
  ];
  if (withErr) {
    segments.push("ERR|||207^bad^HL70357|E");
  }
  return frame(new TextEncoder().encode(segments.join("\r")));
}

/** A socket that answers every write with `ack`. */
export function fakeSocket(ack: Uint8Array): MllpSocket {
  return {
    close: () => Promise.resolve(),
    connect: () => {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const readable = new ReadableStream<Uint8Array>({
        start(c) {
          controller = c;
        },
      });
      const writable = new WritableStream<Uint8Array>({
        write() {
          controller?.enqueue(ack);
        },
      });
      return Promise.resolve({ readable, writable });
    },
  };
}

/** A socket that never opens. */
export const refusingSocket: MllpSocket = {
  close: () => Promise.resolve(),
  connect: () => Promise.reject(new Error("ECONNREFUSED")),
};

/** A socket refused `failures` times, then the one {@link fakeSocket} gives. */
export function flakySocket(failures: number, ack: Uint8Array): MllpSocket {
  const open = fakeSocket(ack);
  let dials = 0;
  return {
    close: open.close,
    connect: (signal) => {
      dials += 1;
      return dials <= failures
        ? Promise.reject(new Error("ECONNREFUSED"))
        : open.connect(signal);
    },
  };
}

/** Captured stdout and stderr; `tty` makes stdout report as a TTY. */
export function capture(tty = false) {
  const state = { err: "", out: "" };
  const stdout = {
    isTTY: tty,
    write: (chunk: string) => {
      state.out += chunk;
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  const stderr = {
    write: (chunk: string) => {
      state.err += chunk;
      return true;
    },
  } as unknown as NodeJS.WritableStream;
  return { state, stderr, stdout };
}
