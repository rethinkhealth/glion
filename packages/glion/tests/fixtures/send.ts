/**
 * Fixtures for `glion send` tests: a message, its acknowledgments, sockets
 * that answer in memory, and a stdout/stderr capture.
 *
 * @module
 */

import { f, m, s } from "@glion/builder";
import type { MllpSocket } from "@glion/mllp-client";
import { frame } from "@glion/mllp-codec";
import { toHl7v2 } from "@glion/to-hl7v2";

/** An ADT^A01 with control ID `MSG00001`. */
export const ADT = toHl7v2(
  m(
    // MSH|^~\&|SENDER|FAC|RECEIVER|FAC|20260531120000||ADT^A01|MSG00001|P|2.5
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f("SENDER"),
      f("FAC"),
      f("RECEIVER"),
      f("FAC"),
      f("20260531120000"),
      f(),
      f("ADT", "A01"),
      f("MSG00001"),
      f("P"),
      f("2.5")
    ),
    // EVN|A01|20260531120000
    s("EVN", f("A01"), f("20260531120000")),
    // PID|1||12345^^^MRN||DOE^JOHN
    s("PID", f("1"), f(), f("12345", "", "", "MRN"), f(), f("DOE", "JOHN"))
  )
);

/** An MLLP-framed acknowledgment of {@link ADT} with MSA-1 `code`. */
export function ackFrame(code: string, withErr = false): Uint8Array {
  const ack = m(
    // MSH|^~\&|RECEIVER|FAC|SENDER|FAC|20260531120001||ACK^A01|ACK00001|P|2.5
    s(
      "MSH",
      f("|"),
      f("^~\\&"),
      f("RECEIVER"),
      f("FAC"),
      f("SENDER"),
      f("FAC"),
      f("20260531120001"),
      f(),
      f("ACK", "A01"),
      f("ACK00001"),
      f("P"),
      f("2.5")
    ),
    // MSA|<code>|MSG00001|the peer says hi
    s("MSA", f(code), f("MSG00001"), f("the peer says hi"))
  );
  if (withErr) {
    // ERR|||207^bad^HL70357|E
    ack.children.push(s("ERR", f(), f(), f("207", "bad", "HL70357"), f("E")));
  }
  return frame(new TextEncoder().encode(toHl7v2(ack)));
}

/**
 * A socket that answers every write with `ack`, and keeps each write in
 * `written`.
 */
export function fakeSocket(
  ack: Uint8Array,
  written: Uint8Array[] = []
): MllpSocket {
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
        write(chunk) {
          written.push(chunk);
          controller?.enqueue(ack);
        },
      });
      return Promise.resolve({ readable, writable });
    },
  };
}

/** A socket that opens, then ends the read side on the first write. */
export const hangUpSocket: MllpSocket = {
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
        controller?.close();
      },
    });
    return Promise.resolve({ readable, writable });
  },
};

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
