import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { afterEach, describe, expect, it } from "vitest";

import { runSend } from "../../src/commands/send";
import {
  ADT,
  ackFrame,
  capture,
  fakeSocket,
  flakySocket,
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

  /** A project directory holding a `glion.config.ts` with `fields`. */
  /**
   * An empty project directory. Every send discovers and imports a config
   * from its cwd, so a shared directory such as `/tmp` would run whatever
   * `glion.config.ts` happens to sit there.
   */
  async function emptyProject(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-bare-"));
    tempDirs.push(dir);
    return dir;
  }

  async function project(fields: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-project-"));
    tempDirs.push(dir);
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./app.ts", ${fields} };`,
      "utf8"
    );
    return dir;
  }

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
      cwd: await emptyProject(),
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

  it("sends to the MLLP standard port when only --host is given", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "mllp.test"],
      cwd: await emptyProject(),
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    expect(JSON.parse(state.out)).toMatchObject({
      host: "mllp.test",
      ok: true,
      port: 2575,
    });
  });

  it("exits 1 and reports the NAK on AE", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: await emptyProject(),
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
      cwd: await project("client: { reconnect: false }"),
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
      cwd: await project(
        "client: { reconnect: { attempts: 1, delay: () => 0 } }"
      ),
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

  it("gives up after the configured attempts", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: await project(
        "client: { reconnect: { attempts: 1, delay: () => 0 } }"
      ),
      socket: flakySocket(2, ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(JSON.parse(state.out).code).toBe("CONNECTION_FAILED");
  });

  it("sends from a project with no config file, on the client's defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-empty-"));
    tempDirs.push(dir);
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: dir,
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(0);
    expect(JSON.parse(state.out)).toMatchObject({ host: "h", ok: true });
  });

  it("writes no cache directory for a send from a project without a config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-nocache-"));
    tempDirs.push(dir);
    const { stderr, stdout } = capture();
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: dir,
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    await expect(stat(join(dir, ".glion"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("errors (exit 2) when the config is invalid", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: await project("client: { sendTimeoutMs: 0 }"),
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toContain("has options that are not valid");
    // The field to fix is the hint, not part of the sentence.
    expect(json.hint).toContain("client.sendTimeoutMs");
  });

  it("loads the config named before the send token, outside cwd", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "glion-send-nowhere-"));
    tempDirs.push(elsewhere);
    // A client setting proves which config was read: one dial, no retries.
    const dir = await project("client: { reconnect: false }");
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      // What `glion --config <path> send` forwards.
      configPath: join(dir, "glion.config.ts"),
      cwd: elsewhere,
      socket: refusingSocket,
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    expect(JSON.parse(state.out).code).toBe("CONNECTION_FAILED");
  });

  it("errors (exit 2) when the cache directory cannot be created", async () => {
    const dir = await project("client: { reconnect: false }");
    // A file where .glion/ belongs, so the compiled config has nowhere to go.
    await writeFile(join(dir, ".glion"), "", "utf8");
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: dir,
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toContain("could not be created");
  });

  it("errors (exit 2) when no target is given", async () => {
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: [],
      cwd: await emptyProject(),
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
      cwd: await emptyProject(),
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
      cwd: await emptyProject(),
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
      cwd: await emptyProject(),
      socket: fakeSocket(ackFrame("AA")),
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
      cwd: await emptyProject(),
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
      cwd: await emptyProject(),
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
    const withVt = `${ADT}\rNT\u000BE|1||free text`;
    const { state, stderr, stdout } = capture();
    const code = await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: await emptyProject(),
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
      cwd: "/tmp",
      socket: fakeSocket(ackFrame("AA")),
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });

    expect(state.err).toMatch(/^== connected {2}h:1 {2}[\d.]+m?s\n$/);
    expect(state.out).not.toContain("== connected");
  });

  it("reports nothing about the connection when it never opened, nor under --json", async () => {
    const tty = capture(true);
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: await project("client: { reconnect: false }"),
      socket: refusingSocket,
      stderr: tty.stderr,
      stdin: Readable.from(ADT),
      stdout: tty.stdout,
    });
    expect(tty.state.err).not.toContain("== ");

    const json = capture();
    await runSend({
      argv: ["--host", "h", "--port", "1"],
      cwd: "/tmp",
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
      cwd: await emptyProject(),
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
      cwd: await project("client: { reconnect: false }"),
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
