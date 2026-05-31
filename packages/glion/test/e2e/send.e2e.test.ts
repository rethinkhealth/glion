import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frame } from "@glion/mllp-transport";
import { afterEach, describe, expect, it } from "vitest";

import { runGlion } from "../../src/run.js";

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
  const ack = frame(ackText);
  const server = createServer((socket) => {
    // Inspect raw bytes (no setEncoding): Buffer.includes(byte) is identical
    // across Node and Bun, whereas a decoded-string match for the FS control
    // byte is not. Reply once the frame terminator (FS) has arrived.
    socket.on("data", (chunk: Buffer) => {
      if (chunk.includes(FS_BYTE)) {
        socket.write(ack);
      }
    });
  });
  const port = await listen(server);
  return { close: () => closeServer(server), port };
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

// This e2e drives runGlion in-process, so `connectNode` (the MLLP client's Node
// adapter) runs inside the test runtime. `@glion/mllp-client` supports Node and
// Cloudflare Workers — not Bun — and its `Duplex.toWeb` stream bridge does not
// deliver the ACK under `bun --bun`, so the send times out. The sibling CLI e2e
// tests avoid this because they spawn the binary as a Node subprocess. Skip the
// live-socket case under Bun; Node e2e + the fake-connector integration tests
// cover this path on supported runtimes.
const isBun = Boolean(process.versions.bun);

describe.skipIf(isBun)("glion send (e2e against a live MLLP server)", () => {
  let server: RunningServer | undefined;
  let dir: string | undefined;

  afterEach(async () => {
    await server?.close();
    if (dir) {
      await rm(dir, { force: true, recursive: true });
    }
    server = undefined;
    dir = undefined;
  });

  it("sends a message from a file and reports the AA accept", async () => {
    server = await startAckServer(ACK);
    dir = await mkdtemp(join(tmpdir(), "glion-send-e2e-"));
    const file = join(dir, "adt.hl7");
    await writeFile(file, ADT, "utf8");

    const { state, stderr, stdout } = capture();
    const code = await runGlion({
      argv: [
        "send",
        file,
        "--host",
        "127.0.0.1",
        "--port",
        String(server.port),
      ],
      cwd: dir,
      stderr,
      stdout,
    });

    expect(code).toBe(0);
    const json = JSON.parse(state.out);
    expect(json.ok).toBe(true);
    expect(json.code).toBe("AA");
    expect(json.controlId).toBe("MSG00001");
  });
});
