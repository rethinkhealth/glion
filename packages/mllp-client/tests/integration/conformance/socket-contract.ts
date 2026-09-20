/**
 * The `MllpSocket` contract as a vitest suite an adapter instantiates.
 * Runtime-neutral: the tests touch Web Streams, timers, and `AbortSignal`
 * only, and dial the remote systems they are given.
 *
 * @module
 */

import { frame } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import type { MllpSocket } from "../../../src/index";
import { adtA01 } from "../../fixtures";
import type { Address } from "../remote-tcp";
import type { Remotes } from "../remotes";

/** TEST-NET-1 (RFC 5737): never routed, so a SYN there is never answered. */
export const BLACKHOLE: Address = { host: "192.0.2.1", port: 65_535 };

/** Time a close may take when nothing is open. */
const PROMPT_MS = 100;

const ONE_MIB = 1024 * 1024;

export interface SocketContractOptions {
  /**
   * Upper bound on `close()` when the remote system never answers the FIN,
   * in milliseconds.
   */
  readonly closeBoundMs: number;
  /** The remote systems `open` dials. */
  readonly remotes: Remotes;
}

const noSignal = () => new AbortController().signal;

/** Milliseconds `promise` took to settle. */
async function elapsed(promise: Promise<unknown>): Promise<number> {
  const started = performance.now();
  await promise;
  return performance.now() - started;
}

/** Everything `reader` yields until it ends or `minBytes` have arrived. */
async function readAll(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  minBytes = Number.POSITIVE_INFINITY
): Promise<{ bytes: Uint8Array; done: boolean }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let done = false;
  while (!done && total < minBytes) {
    const next = await reader.read();
    done = next.done;
    if (!next.done) {
      chunks.push(next.value);
      total += next.value.length;
    }
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, done };
}

/** Registers the contract's tests for the adapter `name`. */
export function describeMllpSocketContract(
  name: string,
  open: (address: Address) => MllpSocket,
  { closeBoundMs, remotes }: SocketContractOptions
): void {
  /** An open socket to `address`, with its streams locked for the test. */
  async function opened(address: Address) {
    const socket = open(address);
    const { readable, writable } = await socket.connect(noSignal());
    return {
      reader: readable.getReader(),
      socket,
      writer: writable.getWriter(),
    };
  }

  describe(`${name}: the MllpSocket contract`, () => {
    describe("connect()", () => {
      it("rejects with signal.reason when the signal aborts mid-attempt, leaving nothing open", async () => {
        const socket = open(BLACKHOLE);
        const controller = new AbortController();
        const reason = new Error("the caller gave up");

        const opening = socket.connect(controller.signal);
        controller.abort(reason);

        await expect(opening).rejects.toBe(reason);
        await expect(elapsed(socket.close())).resolves.toBeLessThan(PROMPT_MS);
      });

      it("rejects with signal.reason when the signal is already aborted", async () => {
        const reason = new Error("the caller gave up");

        await expect(
          open(remotes.acknowledging).connect(AbortSignal.abort(reason))
        ).rejects.toBe(reason);
      });

      it("rejects when nothing is listening, leaving nothing open", async () => {
        const socket = open(remotes.refused);

        await expect(socket.connect(noSignal())).rejects.toThrow();
        await expect(elapsed(socket.close())).resolves.toBeLessThan(PROMPT_MS);
      });

      it("opens a fresh socket after close()", async () => {
        const socket = open(remotes.acknowledging);
        await socket.connect(noSignal());
        await socket.close();

        const { readable, writable } = await socket.connect(noSignal());
        const writer = writable.getWriter();
        const reader = readable.getReader();
        await writer.write(frame(encodeBytes(adtA01().text)));

        await expect(reader.read()).resolves.toMatchObject({ done: false });
        writer.releaseLock();
        reader.releaseLock();
        await socket.close();
      });
    });

    describe("close()", () => {
      it("never rejects, however many times it is called", async () => {
        const socket = open(remotes.acknowledging);
        await socket.connect(noSignal());

        await expect(
          Promise.all([socket.close(), socket.close(), socket.close()])
        ).resolves.toEqual([undefined, undefined, undefined]);
        await expect(socket.close()).resolves.toBeUndefined();
      });

      it("is bounded when the remote system never answers the FIN", async () => {
        const socket = open(remotes.holdingOpen);
        await socket.connect(noSignal());

        await expect(elapsed(socket.close())).resolves.toBeLessThan(
          closeBoundMs
        );
      });

      it("resolves after the remote system has dropped", async () => {
        const { reader, socket, writer } = await opened(remotes.dropping);
        await writer.write(frame(encodeBytes(adtA01().text)));
        await Promise.allSettled([reader.read()]);
        reader.releaseLock();
        writer.releaseLock();

        await expect(socket.close()).resolves.toBeUndefined();
      });

      it("resolves while the streams are locked", async () => {
        const { socket } = await opened(remotes.acknowledging);

        await expect(elapsed(socket.close())).resolves.toBeLessThan(
          closeBoundMs
        );
      });
    });

    describe("readable", () => {
      it("settles a pending read when the remote system resets", async () => {
        const { reader, socket, writer } = await opened(remotes.dropping);
        await writer.write(frame(encodeBytes(adtA01().text)));

        const [read] = await Promise.allSettled([reader.read()]);

        expect(read.status === "rejected" || read.value.done).toBe(true);
        reader.releaseLock();
        writer.releaseLock();
        await socket.close();
      });

      it("ends a pending read when the remote system sends FIN", async () => {
        const { reader, socket, writer } = await opened(remotes.ending);
        await writer.write(frame(encodeBytes(adtA01().text)));

        await expect(reader.read()).resolves.toMatchObject({ done: true });
        reader.releaseLock();
        writer.releaseLock();
        await socket.close();
      });

      it("delivers bytes sent before a clean close ahead of end-of-stream", async () => {
        const { reader, socket, writer } = await opened(
          remotes.acknowledgingThenEnding
        );
        await writer.write(frame(encodeBytes(adtA01().text)));

        const { bytes, done } = await readAll(reader);

        expect(done).toBe(true);
        expect(decodeBytes(bytes)).toContain("MSA|AA|");
        reader.releaseLock();
        writer.releaseLock();
        await socket.close();
      });

      it("round-trips a 1 MiB message", async () => {
        const { reader, socket, writer } = await opened(remotes.echoing);
        const text = `${adtA01().text}\rOBX|1|TX|||${"x".repeat(ONE_MIB)}`;
        const sent = frame(encodeBytes(text));

        const writing = writer.write(sent);
        const { bytes } = await readAll(reader, sent.length);
        await writing;

        expect(bytes).toEqual(sent);
        reader.releaseLock();
        writer.releaseLock();
        await socket.close();
      });
    });
  });
}
