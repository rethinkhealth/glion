import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { frame } from "@glion/mllp-codec";
import { afterEach, describe, expect, it } from "vitest";

import { runSend } from "../../src/commands/send";
import {
  ADT,
  ackFrame,
  capture,
  fakeSocket,
  flakySocket,
  hangUpSocket,
  refusingSocket,
} from "../fixtures/send";

describe("runSend (integration, fake socket)", () => {
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
      socket: fakeSocket(ackFrame("AA")),
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
    // MSA-3 of the acknowledgment, as the client read it off the wire.
    expect(json.text).toBe("the peer says hi");
  });

  it("exits 1 and reports the NAK on AE", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AE", true)),
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
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      reconnect: false,
      socket: refusingSocket,
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(false);
    expect(json.kind).toBe("transport");
  });

  it("reconnects when the first dial is refused, and reports the accept", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      reconnect: { attempts: 1, delay: () => 0 },
      socket: flakySocket(1, ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(true);
    expect(json.code).toBe("AA");
  });

  it("errors (exit 2) when no target is given", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: [],
      socket: fakeSocket(ackFrame("AA")),
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
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    expect(state.out).toContain("glion send");
    expect(state.out).toContain("--host");
  });

  it("prints the parse error and help to stderr and exits 2", async () => {
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: ["--nope"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(state.err).toContain("`--nope` is not a `glion send` flag.");
  });

  it("reads the message from a file argument", async () => {
    const file = await writeMessageFile(ADT);
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: [file, "--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdout,
    });

    expect(code).toBe(0);
    expect(JSON.parse(state.out).code).toBe("AA");
  });

  it("sends each segment of a message read with line feeds ending with a carriage return", async () => {
    const file = await writeMessageFile(ADT.replaceAll("\r", "\n"));
    const written: Uint8Array[] = [];
    const { stdout, stderr } = capture();
    await runSend({
      argv: [file, "--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA"), written),
      stderr,
      stdout,
    });

    expect(Buffer.concat(written)).toStrictEqual(
      Buffer.from(frame(new TextEncoder().encode(ADT)))
    );
  });

  it("reports an invalid outcome when the delimiters cannot write a value", async () => {
    // MSH-1 `X` and MSH-2 `E~\&`: the escape character in MSH-3 is written
    // `\E\` or `\X5C\`, and both hold a delimiter.
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from("MSHXE~\\&XAPP\\bXFAC"),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toBe(
      "The value holds a character that must be written as an escape sequence, and every escape sequence for it holds one of the message's delimiters. With delimiters that are ASCII punctuation, every character can be written."
    );
  });

  it("reports an invalid outcome when the file cannot be read", async () => {
    const { state, stdout, stderr } = capture();
    const code = await runSend({
      argv: ["/no/such/file.hl7", "--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toBe(
      "The message source `/no/such/file.hl7` could not be read."
    );
    expect(json.cause).toContain("ENOENT");
  });

  it("reports an invalid outcome (exit 2) when the message has no MSH-10", async () => {
    const noControlId = ADT.replace("|MSG00001|", "||");
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(noControlId),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.code).toBe("INVALID_MESSAGE");
    expect(json.cause).toContain("MSH-10");
  });

  it("reports an invalid outcome (exit 2) when a Segment ID contains a reserved VT byte", async () => {
    // A control character in a value is encoded as \X0B\ and sent; one in a
    // Segment ID cannot be, so the client refuses the message.
    const withVt = `${ADT}NT\u000BE|1||free text\r`;
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(withVt),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.code).toBe("INVALID_MESSAGE");
  });

  it("reports the connection opening on a TTY, on stderr", async () => {
    const { state, stderr, stdout } = capture(true);
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(state.err).toMatch(/^== connected {2}h:1 {2}[\d.]+m?s\n$/);
    expect(state.out).not.toContain("== connected");
  });

  it("reports a lost connection once, as the exchange's outcome", async () => {
    const { state, stderr, stdout } = capture(true);
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: hangUpSocket,
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    // The client closes with the same error `send()` rejects with, so the
    // terminal must not state the failure a second time.
    const lines = state.err.trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^== connected/);
    expect(lines[1]).toMatch(/^x {2}h:1 {2}CONNECTION_LOST/);
  });

  it("reports nothing about the connection when it never opened, nor under --json", async () => {
    const tty = capture(true);
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      reconnect: false,
      socket: refusingSocket,
      stderr: tty.stderr,
      stdin: Readable.from(ADT),
      stdout: tty.stdout,
    });
    expect(tty.state.err).not.toContain("== ");

    const json = capture();
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
      stderr: json.stderr,
      stdin: Readable.from(ADT),
      stdout: json.stdout,
    });
    expect(json.state.err).toBe("");
  });

  it("renders the human exchange view on a TTY (accept)", async () => {
    const { state, stdout, stderr } = capture(true);
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      socket: fakeSocket(ackFrame("AA")),
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
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      reconnect: false,
      socket: refusingSocket,
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(state.err.length).toBeGreaterThan(0);
    expect(state.out).toBe("");
  });
});
