/**
 * `createSession()` on its own: opening a socket, exchanging messages over
 * it, and ending it.
 */

import { setTimeout } from "node:timers/promises";

import { frame, MllpCodecError } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, it, vi } from "vitest";

import { createSession } from "../../src/client/session";
import { MllpErrorCode } from "../../src/errors";
import { adtA01 } from "../fixtures";
import { stubSocket } from "./fixtures";

describe("createSession()", () => {
  describe("opening", () => {
    it("resolves `ready` once the socket has opened", async () => {
      // Given
      const { socket } = stubSocket();

      // When
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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

  describe("opening it fails", () => {
    it("ends a socket whose streams cannot be taken over", async () => {
      // Given a socket that hands back a readable someone else already holds.
      const { socket, remote } = stubSocket((streams) => {
        streams.readable.getReader();
        return Promise.resolve(streams);
      });

      // When
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // Then the socket that opened is not left open behind the rejection.
      await expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECT_FAILED,
      });
      expect(remote.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("exchange()", () => {
    it("frames the message, sends it, and returns the reply unframed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const message = encodeBytes(adtA01().text);

      // When
      // Not awaited yet: the in-memory stream applies backpressure until the
      // far end pulls, so reading is what lets the write complete.
      const exchanging = connection.exchange(message, 5000);

      // Then
      expect(await remote.wrote()).toEqual(frame(message));
      await remote.sends(frame(encodeBytes("MSH|^~\\&|ACK")));
      expect(decodeBytes((await exchanging) ?? new Uint8Array())).toBe(
        "MSH|^~\\&|ACK"
      );
    });

    it("returns ANY reply with its MLLP framing removed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();
      await remote.sends(frame(encodeBytes("ANY_MESSAGE")));

      // Then
      expect(decodeBytes((await exchanging) ?? new Uint8Array())).toBe(
        "ANY_MESSAGE"
      );
    });

    it("returns null once the remote system has closed", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();
      await remote.hangsUp();

      // Then
      expect(await exchanging).toBeNull();
    });

    it("rejects when the reply is not an MLLP frame", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();
      await remote.sends(encodeBytes("HTTP/1.1 400 Bad Request\r\n"));

      // Then
      await expect(exchanging).rejects.toBeInstanceOf(MllpCodecError);
    });

    it("rejects a reply frame that never ends, once it passes the byte cap", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
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
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();
      await remote.sends(unterminated);

      // Then
      await expect(exchanging).rejects.toBeInstanceOf(MllpCodecError);
    });

    it("rejects INVALID_MESSAGE without writing when the message cannot be framed", async () => {
      // Given a message carrying FS, which MLLP reserves as the end of a block.
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const reserved = encodeBytes(`MSH|^~\\&|A${String.fromCodePoint(0x1c)}`);

      // When / Then
      await expect(connection.exchange(reserved, 5000)).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      expect(remote.close).not.toHaveBeenCalled();
    });

    it("rejects SEND_TIMEOUT and ends the socket when no reply arrives in time", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 20);
      await remote.wrote();

      // Then
      await expect(exchanging).rejects.toMatchObject({
        code: MllpErrorCode.SEND_TIMEOUT,
        timeoutMs: 20,
      });
      expect(remote.close).toHaveBeenCalledTimes(1);
    });

    it("leaves the socket open when the deadline elapses after the reply", async () => {
      // Given a clock the test owns, so the deadline is not held back by the
      // event loop: `clearTimeout` runs in the microtask drain after the read
      // settles, and nothing here waits for a real macrotask.
      vi.useFakeTimers();
      try {
        const { socket, remote } = stubSocket();
        const connection = createSession(socket, {
          maxBufferedBytes: 1024,
          timeoutMs: 5000,
        });
        await connection.ready;

        // When the reply arrives, and only then does the clock pass 20ms
        const exchanging = connection.exchange(encodeBytes(adtA01().text), 20);
        await remote.wrote();
        await remote.sends(frame(encodeBytes("ACK")));
        await exchanging;
        await vi.advanceTimersByTimeAsync(60);

        // Then a deadline that fires destroys the connection, and destroying
        // is not scoped to the exchange that armed it.
        expect(remote.close).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("leaves the socket open when the reply arrives in time", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;

      // When the reply arrives well inside a short timeout
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 20);
      await remote.wrote();
      await remote.sends(frame(encodeBytes("ACK")));
      await exchanging;

      // Then the socket is still open past the window a timeout would have
      // ended it in, so the next message has a connection to go out on.
      await setTimeout(40);
      expect(remote.close).not.toHaveBeenCalled();
    });
  });

  describe("destroy() once it is open", () => {
    it("ends the socket", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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

    it("rejects a waiting exchange with the reason it was destroyed for", async () => {
      // Given an exchange parked on its reply: this is how a close reaches the
      // caller waiting for an acknowledgment.
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const reason = new Error("the client closed");
      const waiting = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();

      // When
      await connection.destroy(reason);

      // Then
      await expect(waiting).rejects.toBe(reason);
    });

    it("rejects a waiting exchange even with no reason given", async () => {
      // Given
      const { socket, remote } = stubSocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const waiting = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();

      // When
      await connection.destroy();

      // Then: what must never happen is an exchange that hangs the caller
      // forever.
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
      const connection = createSession(socket, {
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
