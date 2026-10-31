import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createServer } from "node:tls";
import type { Server, TlsOptions } from "node:tls";

import { frame } from "@glion/mllp-codec";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runSend } from "../../src/commands/send";
import { issue } from "../fixtures/pki";
import type { Pki } from "../fixtures/pki";
import { ADT, capture } from "../fixtures/send";

/** MLLP end-of-block byte (FS). */
const FS_BYTE = 0x1c;

const ACK = [
  "MSH|^~\\&|RECEIVER|FAC|SENDER|FAC|20260531120001||ACK^A01|ACK00001|P|2.5\r",
  "MSA|AA|MSG00001\r",
].join("");

/** Closes a server and waits for it to stop listening. */
function closeServer(server: Server): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- bridge net.Server's close callback
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

/** A TLS MLLP server on loopback that answers every message with `ACK`. */
async function listen(
  tls: TlsOptions
): Promise<{ port: number; server: Server }> {
  const ack = frame(new TextEncoder().encode(ACK));
  const server = createServer(tls, (socket) => {
    socket.on("error", () => {
      // A client that fails verification resets the connection; the test
      // asserts on the client's side.
    });
    socket.on("data", (chunk: Buffer) => {
      if (chunk.includes(FS_BYTE)) {
        socket.write(ack);
      }
    });
  });
  // oxlint-disable-next-line promise/avoid-new -- bridge net.Server's listen callback
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return { port: (server.address() as AddressInfo).port, server };
}

describe("glion send over TLS", () => {
  let pki: Pki;
  /** Presents a certificate the test CA issued. */
  let issued: { port: number; server: Server };
  /** Presents a self-signed certificate, as a development server does. */
  let dev: { port: number; server: Server };
  /** Presents an issued certificate and requires one from the client. */
  let mutual: { port: number; server: Server };
  const dirs: string[] = [];

  beforeAll(async () => {
    pki = await issue();
    const serverTls = { cert: pki.serverCert, key: pki.serverKey };
    issued = await listen(serverTls);
    dev = await listen({ cert: pki.selfSignedCert, key: pki.selfSignedKey });
    mutual = await listen({
      ...serverTls,
      ca: pki.ca,
      rejectUnauthorized: true,
      requestCert: true,
    });
  });

  afterAll(async () => {
    await Promise.all([
      closeServer(issued.server),
      closeServer(dev.server),
      closeServer(mutual.server),
    ]);
  });

  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { force: true, recursive: true });
    }
  });

  /** A directory holding the test PKI as PEM files. */
  async function pemDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-tls-"));
    dirs.push(dir);
    await Promise.all([
      writeFile(join(dir, "ca.pem"), pki.ca),
      writeFile(join(dir, "client.pem"), pki.cert),
      writeFile(join(dir, "client.key"), pki.key),
      writeFile(join(dir, "self-signed.pem"), pki.selfSignedCert),
    ]);
    return dir;
  }

  /** Runs one send, dialing once. */
  async function send(argv: string[], tty = false) {
    const { state, stderr, stdout } = capture(tty);
    const code = await runSend({
      argv,
      reconnect: false,
      stderr,
      stdin: Readable.from(ADT),
      stdout,
    });
    return { code, state };
  }

  it("dials a server that signed its own certificate, named with --ca", async () => {
    // What a development server presents: a certificate that is its own
    // issuer, trusted by naming it as the authority.
    const dir = await pemDir();
    const { code, state } = await send([
      "--host",
      "localhost",
      "--port",
      String(dev.port),
      "--ca",
      join(dir, "self-signed.pem"),
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(state.out).code).toBe("AA");
  });

  it("dials a server whose certificate the named authority issued", async () => {
    const dir = await pemDir();
    const { code, state } = await send([
      "--host",
      "localhost",
      "--port",
      String(issued.port),
      "--ca",
      join(dir, "ca.pem"),
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(state.out).code).toBe("AA");
  });

  it("marks the connection TLS in the terminal view", async () => {
    const dir = await pemDir();
    const { code, state } = await send(
      [
        "--host",
        "localhost",
        "--port",
        String(issued.port),
        "--ca",
        join(dir, "ca.pem"),
      ],
      true
    );

    expect(code).toBe(0);
    expect(state.err).toMatch(/^== connected {2}localhost:\d+ {2}TLS {2}/);
  });

  it("marks a connection whose certificate was not verified", async () => {
    const { code, state } = await send(
      ["--host", "127.0.0.1", "--port", String(issued.port), "--insecure"],
      true
    );

    expect(code).toBe(0);
    expect(state.err).toMatch(
      /^== connected {2}127\.0\.0\.1:\d+ {2}TLS unverified {2}/
    );
  });

  it("fails to connect when the certificate does not list the dialed address", async () => {
    const dir = await pemDir();
    const { code, state } = await send([
      "--host",
      "127.0.0.1",
      "--port",
      String(issued.port),
      "--ca",
      join(dir, "ca.pem"),
    ]);

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.code).toBe("CONNECTION_FAILED");
    expect(json.cause).toContain("127.0.0.1");
  });

  it("fails to connect when the runtime's authorities do not trust the server", async () => {
    const { code, state } = await send([
      "--host",
      "localhost",
      "--port",
      String(issued.port),
      "--tls",
    ]);

    expect(code).toBe(2);
    expect(JSON.parse(state.out).code).toBe("CONNECTION_FAILED");
  });

  it("presents a client certificate to a server that requires one", async () => {
    const dir = await pemDir();
    const { code, state } = await send([
      "--host",
      "localhost",
      "--port",
      String(mutual.port),
      "--ca",
      join(dir, "ca.pem"),
      "--cert",
      join(dir, "client.pem"),
      "--key",
      join(dir, "client.key"),
    ]);

    expect(code).toBe(0);
    expect(JSON.parse(state.out).code).toBe("AA");
  });

  it("is not delivered without a client certificate the server requires", async () => {
    const dir = await pemDir();
    const { code, state } = await send([
      "--host",
      "localhost",
      "--port",
      String(mutual.port),
      "--ca",
      join(dir, "ca.pem"),
      "--timeout",
      "2000",
    ]);

    expect(code).toBe(2);
    expect(JSON.parse(state.out).kind).toBe("transport");
  });

  it("reports a TLS file it cannot read as invalid, before dialing", async () => {
    const dir = await pemDir();
    const missing = join(dir, "missing.pem");
    const { code, state } = await send([
      "--host",
      "127.0.0.1",
      "--port",
      String(issued.port),
      "--ca",
      missing,
    ]);

    expect(code).toBe(2);
    const json = JSON.parse(state.out);
    expect(json.kind).toBe("invalid");
    expect(json.message).toBe(`The TLS file \`${missing}\` could not be read.`);
    expect(json.hint).toContain("`--ca`");
    // The endpoint was already resolved, so the line still names it.
    expect(json.host).toBe("127.0.0.1");
    expect(json.port).toBe(issued.port);
  });
});
