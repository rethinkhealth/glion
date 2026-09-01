import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import type { MllpConnector, MllpDuplex } from "@glion/mllp-client";
import { frame } from "@glion/mllp-codec";
import { afterEach, describe, expect, it } from "vitest";

import { runSend } from "./send";

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
  return frame(new TextEncoder().encode(segments.join("\r")));
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

/** Capture stdout/stderr; `tty` makes stdout report as a TTY (human output). */
function capture(tty = false) {
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

describe("runSend (integration, fake connector)", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { force: true, recursive: true });
      }
    }
  });

  async function writeMessageFile(contents: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-int-"));
    tempDirs.push(dir);
    const file = join(dir, "msg.hl7");
    await writeFile(file, contents, "utf8");
    return file;
  }

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

  it("prints help and exits 0 for --help", async () => {
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: ["--help"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    expect(state.out).toContain("glion send");
    expect(state.out).toContain("--local");
  });

  it("prints the parse error and help to stderr and exits 2", async () => {
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: ["--nope"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(state.err).toContain("Unknown flag: --nope");
  });

  it("reads the message from a file argument", async () => {
    const file = await writeMessageFile(ADT);
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: [file, "--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdout,
    });

    expect(code).toBe(0);
    expect(JSON.parse(state.out).code).toBe("AA");
  });

  it("reports an invalid outcome when the file cannot be read", async () => {
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: ["/no/such/file.hl7", "--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toContain("Could not read the message");
  });

  it("reports an invalid outcome (exit 2) when the message has no MSH-10", async () => {
    const noControlId = ADT.replace("|MSG00001|", "||");
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(noControlId),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toContain("MSH-10");
  });

  it("reports an invalid outcome (exit 2) when the message contains a reserved VT byte", async () => {
    const withVt = `${ADT}\rNTE|1||free\u000Btext`;
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(withVt),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
  });

  it("renders the human exchange view on a TTY (accept)", async () => {
    const { state, stdout, stderr } = capture(true);
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      connect: fakeConnector(ackFrame("AA")),
      cwd: "/tmp",
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    // Human output, not JSON.
    expect(state.out).toContain("ACK");
    expect(state.out).toContain("MSG00001");
    expect(() => JSON.parse(state.out)).toThrow();
  });

  it("writes human transport errors to stderr on a TTY", async () => {
    const { state, stdout, stderr } = capture(true);
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
    expect(state.err.length).toBeGreaterThan(0);
    expect(state.out).toBe("");
  });
});
