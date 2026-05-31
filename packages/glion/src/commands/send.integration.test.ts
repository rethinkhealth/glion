import { Readable } from "node:stream";

import type { MllpConnector, MllpDuplex } from "@glion/mllp-client";
import { frame } from "@glion/mllp-transport";
import { describe, expect, it } from "vitest";

import { runSend } from "./send.js";

const ADT = [
  "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260531120000||ADT^A01|MSG00001|P|2.5",
  "EVN|A01|20260531120000",
  "PID|1||12345^^^MRN||DOE^JOHN",
].join("\r");

/** Build an MLLP-framed ACK whose MSA-2 echoes the request control id. */
function ackFrame(code: string, withErr = false): Uint8Array {
  const segments = [
    "MSH|^~\\&|RECEIVER|FAC|SENDER|FAC|20260531120001||ACK^A01|ACK00001|P|2.5",
    `MSA|${code}|MSG00001|the peer says hi`,
  ];
  if (withErr) {
    segments.push("ERR|||207^bad^HL70357|E");
  }
  return frame(segments.join("\r"));
}

/**
 * A fake MLLP duplex that replies with `ack` as soon as a request is written.
 * The MllpClient's injectable connector is what makes this socket-free.
 */
function fakeConnector(ack: Uint8Array): MllpConnector {
  return (): Promise<MllpDuplex> => {
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
    let resolveClosed: () => void = () => {
      // replaced synchronously by the executor below
    };
    // oxlint-disable-next-line promise/avoid-new -- deferred resolved on close()
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    return Promise.resolve({
      close: () => {
        resolveClosed();
        return Promise.resolve();
      },
      closed,
      readable,
      writable,
    });
  };
}

function capture() {
  const state = { err: "", out: "" };
  const stdout = {
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

describe("runSend (integration, fake connector)", () => {
  it("exits 0 and reports AA on accept", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(true);
    expect(json.code).toBe("AA");
    expect(json.requestControlId).toBe("MSG00001");
    expect(json.controlId).toBe("MSG00001");
  });

  it("exits 1 and reports the NAK on AE", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AE", true)),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(1);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(false);
    expect(json.kind).toBe("nak");
    expect(json.code).toBe("AE");
    expect(json.errorCode).toBe("207");
  });

  it("exits 2 on a connection failure", async () => {
    const { state, stderr, stdout } = capture();
    const failing: MllpConnector = () =>
      Promise.reject(new Error("ECONNREFUSED"));
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: failing,
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(false);
    expect(json.kind).toBe("transport");
  });

  it("exits 2 and reports invalid on non-HL7v2 input", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from("this is not hl7v2"),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(false);
    expect(json.kind).toBe("invalid");
  });

  it("errors (exit 2) when no target is given", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: [],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(JSON.parse(state.out).kind).toBe("invalid");
  });
});
