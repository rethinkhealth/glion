import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

import { frame } from "@glion/mllp-codec";
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

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

/** A minimal MLLP server: on a complete frame it replies with `ackText`. */
async function startAckServer(ackText: string): Promise<RunningServer> {
  const ack = frame(new TextEncoder().encode(ackText));
  const server = createServer((socket) => {
    socket.on("data", (chunk: Buffer) => {
      if (chunk.includes(FS_BYTE)) {
        socket.write(ack);
      }
    });
  });
  const port = await listen(server);
  return { close: () => closeServer(server), port };
}

// `glion send` exercises the MLLP *client* (@glion/mllp-client's connectNode +
// Duplex.toWeb), which supports Node and Cloudflare Workers — not Bun. Under the
// `bun --bun` CI job, process.execPath is the bun binary, so the spawned
// `dist/index.js send` runs the client under Bun and times out. (The sibling
// glion-start e2e passes under Bun because it exercises the server, not the
// client.) Skip here; Node e2e + the fake-connector integration tests cover the
// send path on supported runtimes.
const isBun = Boolean(process.versions.bun);

describe.skipIf(isBun)("glion send e2e", () => {
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
});
