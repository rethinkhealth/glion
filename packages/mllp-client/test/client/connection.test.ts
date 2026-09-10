/**
 * `createConnection()` on its own: opening a socket, reading and writing
 * messages over it, and ending it.
 */

import { setTimeout } from "node:timers/promises";

import { frame, MllpCodecError } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, it } from "vitest";

import { createConnection } from "../../src/client/connection";
import { MllpErrorCode } from "../../src/errors";
import { adtA01 } from "../fixtures";
import { stubSocket } from "./fixtures";

describe("createConnection()", () => {
  describe("opening", () => {
    it("resolves `ready` once the socket has opened", async () => {
      // Given
      const { socket } = stubSocket();

      // When
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // Then
      await expect(connection.ready).resolves.toBeUndefined();
    });

    it("hands the socket a signal that carries the deadline", async () => {
      // Given
      const { socket, remote } = stubSocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal }); // simulate a long delay to test abort
        throw new Error("unreachable");
      });

      // When
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5, // very short timeout to trigger abort
      });

      // Then
      await expect(connection.ready).rejects.toThrow();
      expect(remote.signal?.aborted).toBe(true);
    });

    it("rejects `ready` with CONNECT_FAILED when the socket rejects", async () => {
      // Given
      const { socket } = stubSocket(() =>
        Promise.reject(new Error("ECONNREFUSED"))
      );

      // When
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // Then
      await expect(connection.ready).rejects.toMatchObject({
        cause: expect.objectContaining({ message: "ECONNREFUSED" }),
        code: MllpErrorCode.CONNECT_FAILED,
      });
    });

    it("rejects `ready` with CONNECT_FAILED when the socket throws synchronously", async () => {
      // Given
      const { socket } = stubSocket(() => {
        throw new Error("no such host");
      });

      // When
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // Then
      await expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_FAILED,
      });
    });

    it("rejects `ready` with CONNECT_TIMEOUT when the socket does not open in time", async () => {
      // Given
      const { socket } = stubSocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });

      // When
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5, // very short timeout to expire before the socket opens
      });

      // Then
      await expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_TIMEOUT,
        timeoutMs: 5,
      });
    });
  });

  describe("read()", () => {
    it("returns the message with its MLLP framing removed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const { text } = adtA01();

      // When
      await remote.sends(frame(encodeBytes(text)));
      const message = await connection.read();

      // Then
      expect(decodeBytes(message ?? new Uint8Array())).toBe(text);
    });

    it("returns ANY message with its MLLP framing removed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      await remote.sends(frame(encodeBytes("ANY_MESSAGE")));
      const message = await connection.read();

      // Then
      expect(decodeBytes(message ?? new Uint8Array())).toBe("ANY_MESSAGE");
    });

    it("returns null once the remote system has closed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      await remote.hangsUp();

      // Then
      expect(await connection.read()).toBeNull();
    });

    it("rejects when the bytes are not an MLLP frame", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      await remote.sends(encodeBytes("HTTP/1.1 400 Bad Request\r\n"));

      // Then
      await expect(connection.read()).rejects.toBeInstanceOf(MllpCodecError);
    });

    it("rejects a frame that never ends, once it passes the byte cap", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 16, // small cap so a short frame overruns it
        timeoutMs: 5000,
      });
      await connection.ready;
      // A start-of-block byte, then 64 bytes that never terminate it.
      const unterminated = new Uint8Array([
        0x0b,
        ...new Uint8Array(64).fill(0x41),
      ]);

      // When
      await remote.sends(unterminated);

      // Then
      await expect(connection.read()).rejects.toBeInstanceOf(MllpCodecError);
    });
  });

  describe("write()", () => {
    it("frames the message and puts it on the socket", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const message = encodeBytes(adtA01().text);

      // When
      // Not awaited yet: the in-memory stream applies backpressure until the
      // far end pulls, so reading is what lets the write complete.
      const writing = connection.write(message);

      // Then
      expect(await remote.wrote()).toEqual(frame(message));
      await writing;
    });

    it("rejects INVALID_MESSAGE without writing when the message cannot be framed", async () => {
      // Given a message carrying FS, which MLLP reserves as the end of a block.
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const reserved = encodeBytes(`MSH|^~\\&|A${String.fromCodePoint(0x1c)}`);

      // When / Then
      await expect(connection.write(reserved)).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      expect(remote.close).not.toHaveBeenCalled();
    });
  });

  describe("destroy() once it is open", () => {
    it("ends the socket", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      await connection.destroy();

      // Then
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("ends it once, however many times it is called", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      await Promise.all([connection.destroy(), connection.destroy()]);
      await connection.destroy();

      // Then
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("rejects a waiting read with the reason it was destroyed for", async () => {
      // Given a read parked on the connection: this is how a send deadline
      // reaches the caller.
      const { socket } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const reason = new Error("no acknowledgment in time");
      const waiting = connection.read();

      // When
      await connection.destroy(reason);

      // Then
      await expect(waiting).rejects.toBe(reason);
    });

    it("rejects a waiting read even with no reason given", async () => {
      // Given
      const { socket } = stubSocket();
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const waiting = connection.read();

      // When
      await connection.destroy();

      // Then: what must never happen is a read that hangs the caller forever.
      await expect(waiting).rejects.toThrow();
    });
  });

  describe("destroy() while it is still opening", () => {
    it("resolves, even though the socket never opened", async () => {
      // Given
      const { socket } = stubSocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // When / Then
      await expect(connection.destroy()).resolves.toBeUndefined();
    });

    it("tells the socket to stop", async () => {
      // Given
      const { socket, remote } = stubSocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // When
      await connection.destroy();

      // Then
      expect(remote.signal?.aborted).toBe(true);
    });

    it("rejects `ready` with the reason it was destroyed for", async () => {
      // Given
      const { socket } = stubSocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      const reason = new Error("the client closed");

      // When
      await connection.destroy(reason);

      // Then
      await expect(connection.ready).rejects.toBe(reason);
    });

    it("closes a socket that opens after the cancellation anyway", async () => {
      // Given a socket that ignores the signal and opens anyway.
      const { socket, remote } = stubSocket(async (streams) => {
        await setTimeout(20); // opens after the caller has given up
        return streams;
      });
      const connection = createConnection(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // When
      await connection.destroy();

      // Then
      expect(remote.close).toHaveBeenCalled();
    });
  });
});
