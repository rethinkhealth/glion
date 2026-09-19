import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { createServer as createTlsServer } from "node:tls";
import type { TlsOptions } from "node:tls";
import { fileURLToPath } from "node:url";

import { frame } from "@glion/mllp-codec";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import { issue } from "../fixtures/pki";

// Drive the built binary as a subprocess (like the sibling CLI e2e tests)
// rather than importing runGlion in-process. The in-process path pulls in the
// config schema, whose top-level `z.object(...)` crashes when vitest transforms
// the TS source under `bun --bun`; the compiled binary loads zod fine.
const binPath = resolvePath(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "index.js"
);

const ADT = [
  "MSH|^~\\&|SENDER|FAC|RECEIVER|FAC|20260531120000||ADT^A01|MSG00001|P|2.5",
  "EVN|A01|20260531120000",
  "PID|1||12345^^^MRN||DOE^JOHN",
].join("\r");

const ACK = [
  "MSH|^~\\&|RECEIVER|FAC|SENDER|FAC|20260531120001||ACK^A01|ACK00001|P|2.5",
  "MSA|AA|MSG00001",
].join("\r");

/** MLLP end-of-block byte (FS) — the frame terminator the server waits for. */
const FS_BYTE = 0x1c;

interface RunningServer {
  port: number;
  close: () => Promise<void>;
}

function listen(server: Server): Promise<number> {
  // oxlint-disable-next-line promise/avoid-new -- bridge net.Server's listen callback
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve(port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- bridge net.Server's close callback
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

/**
 * A minimal MLLP server: on a complete frame it replies with `ackText`. Over
 * TLS when `tls` is given.
 */
async function startAckServer(
  ackText: string,
  tls?: TlsOptions
): Promise<RunningServer> {
  const ack = frame(new TextEncoder().encode(ackText));
  const onSocket = (socket: NodeJS.ReadWriteStream) => {
    socket.on("data", (chunk: Buffer) => {
      if (chunk.includes(FS_BYTE)) {
        socket.write(ack);
      }
    });
  };
  const server = tls ? createTlsServer(tls, onSocket) : createServer(onSocket);
  const port = await listen(server);
  return { close: () => closeServer(server), port };
}

describe("glion send e2e", () => {
  let server: RunningServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("sends a message from stdin and reports the AA accept", async () => {
    server = await startAckServer(ACK);
    const args = [
      binPath,
      "send",
      "--host",
      "127.0.0.1",
      "--port",
      String(server.port),
      "--json",
    ];

    const result = await execa(process.execPath, args, {
      input: ADT,
      reject: false,
    });

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(true);
    expect(json.code).toBe("AA");
    expect(json.controlId).toBe("MSG00001");
  }, 10_000);

  it("reads --config given before the send token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "glion-send-e2e-config-"));
    const elsewhere = await mkdtemp(join(tmpdir(), "glion-send-e2e-cwd-"));
    try {
      // `reconnect: false` is what proves this config was read: without it
      // a refused dial retries for about thirty seconds.
      await writeFile(
        join(dir, "glion.config.ts"),
        `export default { entry: "./app.ts", client: { reconnect: false } };`
      );

      const result = await execa(
        process.execPath,
        [
          binPath,
          "--config",
          join(dir, "glion.config.ts"),
          "send",
          "--host",
          "127.0.0.1",
          "--port",
          "1",
          "--json",
        ],
        { cwd: elsewhere, input: ADT, reject: false }
      );

      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).code).toBe("CONNECTION_FAILED");
    } finally {
      await rm(dir, { force: true, recursive: true });
      await rm(elsewhere, { force: true, recursive: true });
    }
  }, 20_000);

  it("sends over TLS to a server with a self-signed certificate", async () => {
    const pki = await issue();
    server = await startAckServer(ACK, {
      cert: pki.selfSignedCert,
      key: pki.selfSignedKey,
    });
    const dir = await mkdtemp(join(tmpdir(), "glion-send-e2e-tls-"));
    try {
      await Promise.all([
        writeFile(join(dir, "server.pem"), pki.selfSignedCert),
        writeFile(
          join(dir, "glion.config.ts"),
          `export default { entry: "./app.ts", client: { reconnect: false, tls: { ca: "./server.pem", servername: "localhost" } } };`
        ),
      ]);

      const result = await execa(
        process.execPath,
        [
          binPath,
          "send",
          "--host",
          "127.0.0.1",
          "--port",
          String(server.port),
          "--json",
        ],
        { cwd: dir, input: ADT, reject: false }
      );

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).code).toBe("AA");
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  }, 20_000);
});
