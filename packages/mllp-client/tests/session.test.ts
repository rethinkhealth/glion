/**
 * `createSession()` on its own: opening a socket, exchanging messages over
 * it, and ending it.
 */

import { setTimeout } from "node:timers/promises";

import { frame, MllpCodecError } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, it, vi } from "vitest";

import { MllpErrorCode } from "../src/errors";
import { createSession } from "../src/session";
import { adtA01 } from "./fixtures";
import { memorySocket } from "./remote";

describe("createSession()", () => {
  describe("opening", () => {
    it("resolves `ready` once the socket has opened", async () => {
      // Given
      const { socket } = memorySocket();

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
      const { socket, remote } = memorySocket(async (_streams, signal) => {
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

    it("rejects `ready` with CONNECTION_FAILED when the socket rejects", async () => {
      // Given
      const { socket } = memorySocket(() =>
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
        code: MllpErrorCode.CONNECTION_FAILED,
      });
    });

    it("rejects `ready` with CONNECTION_FAILED when the socket throws synchronously", async () => {
      // Given
      const { socket } = memorySocket(() => {
        throw new Error("no such host");
      });

      // When
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // Then
      await expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });
    });

    it("rejects `ready` with CONNECTION_TIMEOUT when the socket does not open in time", async () => {
      // Given
      const { socket } = memorySocket(async (_streams, signal) => {
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
        code: MllpErrorCode.CONNECTION_TIMEOUT,
        timeoutMs: 5,
      });
    });
  });

  describe("opening it fails", () => {
    it("ends a socket whose streams cannot be taken over", async () => {
      // Given a socket that hands back a readable someone else already holds.
      const { socket, remote } = memorySocket((streams) => {
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
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      expect(remote.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("exchange()", () => {
    it("frames the message, sends it, and returns the reply unframed", async () => {
      // Given
      const { socket, remote } = memorySocket();
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
      expect(decodeBytes(await exchanging)).toBe("MSH|^~\\&|ACK");
    });

    it("returns a complete reply even when the remote system hangs up right after it", async () => {
      // Given
      const { socket, remote } = memorySocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();

      // When the reply and the end of the stream arrive together
      void remote.sends(frame(encodeBytes("MSH|^~\\&|ACK")));
      void remote.hangsUp();

      // Then the reply is read before the end is seen
      expect(decodeBytes(await exchanging)).toBe("MSH|^~\\&|ACK");
    });

    it("returns ANY reply with its MLLP framing removed", async () => {
      // Given
      const { socket, remote } = memorySocket();
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
      expect(decodeBytes(await exchanging)).toBe("ANY_MESSAGE");
    });

    it("rejects CONNECTION_LOST once the remote system has closed", async () => {
      // Given
      const { socket, remote } = memorySocket();
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
      await expect(exchanging).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_LOST,
      });
    });

    it("waits for the session to open when called before it has", async () => {
      // Given a socket that takes its time to open
      const { socket, remote } = memorySocket(async (streams) => {
        await setTimeout(20);
        return streams;
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // When
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.acknowledges("AA");

      // Then
      await expect(exchanging).resolves.toBeInstanceOf(Uint8Array);
      await connection.destroy();
    });

    it("rejects with the opening's own failure when the session never opens", async () => {
      // Given
      const { socket } = memorySocket(() =>
        Promise.reject(new Error("ECONNREFUSED"))
      );
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      // When / Then
      await expect(
        connection.exchange(encodeBytes(adtA01().text), 5000)
      ).rejects.toMatchObject({ code: MllpErrorCode.CONNECTION_FAILED });
    });

    it("rejects CONNECTION_LOST with the stream's error when the connection resets", async () => {
      // Given
      const { socket, remote } = memorySocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const exchanging = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();

      // When
      await remote.resets();

      // Then
      await expect(exchanging).rejects.toMatchObject({
        cause: expect.objectContaining({ message: "ECONNRESET" }),
        code: MllpErrorCode.CONNECTION_LOST,
      });
    });

    it("rejects when the reply is not an MLLP frame", async () => {
      // Given
      const { socket, remote } = memorySocket();
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
      const { socket, remote } = memorySocket();
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
      const { socket, remote } = memorySocket();
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

      // And the wire is still in step: the next message is the first thing
      // the remote end reads.
      const valid = encodeBytes(adtA01().text);
      const exchanging = connection.exchange(valid, 5000);
      expect(await remote.wrote()).toEqual(frame(valid));
      await remote.sends(frame(encodeBytes("MSH|^~\\&|ACK")));
      await exchanging;
      await connection.destroy();
    });

    it("rejects INVALID_MESSAGE before waiting for the session to open", async () => {
      // Given a session that never opens
      const { socket } = memorySocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      const opening = expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });
      const reserved = encodeBytes(`MSH|^~\\&|A${String.fromCodePoint(0x1c)}`);

      // When / Then the message is refused for what it is, not for the
      // session's state.
      await expect(connection.exchange(reserved, 5000)).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      await connection.destroy();
      await opening;
    });

    it("rejects INVALID_MESSAGE without starting the send deadline", async () => {
      // Given a deadline that would fire almost at once
      const { socket, remote } = memorySocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const reserved = encodeBytes(`MSH|^~\\&|A${String.fromCodePoint(0x1c)}`);

      // When
      await expect(connection.exchange(reserved, 1)).rejects.toMatchObject({
        code: MllpErrorCode.INVALID_MESSAGE,
      });
      await setTimeout(10);

      // Then no deadline fired, so nothing tore the socket down.
      expect(remote.close).not.toHaveBeenCalled();
      await connection.destroy();
    });

    it("rejects SEND_TIMEOUT and ends the socket when no reply arrives in time", async () => {
      // Given
      const { socket, remote } = memorySocket();
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
        const { socket, remote } = memorySocket();
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
      const { socket, remote } = memorySocket();
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
      const { socket, remote } = memorySocket();
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
      const { socket, remote } = memorySocket();
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

    it("rejects a waiting exchange with SEND_ABORTED", async () => {
      // Given an exchange parked on its reply: this is how a close reaches the
      // caller waiting for an acknowledgment.
      const { socket, remote } = memorySocket();
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });
      await connection.ready;
      const waiting = connection.exchange(encodeBytes(adtA01().text), 5000);
      await remote.wrote();

      // When
      await connection.destroy();

      // Then
      await expect(waiting).rejects.toMatchObject({
        code: MllpErrorCode.SEND_ABORTED,
      });
    });
  });

  describe("cancelled by `signal` while it is still opening", () => {
    it("ends itself: `ready` rejects with CONNECTION_FAILED once the socket is down", async () => {
      // Given
      const { socket, remote } = memorySocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const abort = new AbortController();
      const connection = createSession(
        socket,
        { maxBufferedBytes: 1024, timeoutMs: 5000 },
        abort.signal
      );
      const opening = expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });

      // When
      abort.abort();

      // Then
      await opening;
      expect(remote.signal?.aborted).toBe(true);
    });
  });

  describe("destroy() while it is still opening", () => {
    it("resolves, even though the socket never opened", async () => {
      // Given
      const { socket } = memorySocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      const opening = expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });

      // When / Then
      await expect(connection.destroy()).resolves.toBeUndefined();
      await opening;
    });

    it("tells the socket to stop", async () => {
      // Given
      const { socket, remote } = memorySocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      const opening = expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });

      // When
      await connection.destroy();
      await opening;

      // Then
      expect(remote.signal?.aborted).toBe(true);
    });

    it("rejects `ready` with CONNECTION_FAILED, the cancellation as its cause", async () => {
      // Given
      const { socket } = memorySocket(async (_streams, signal) => {
        await setTimeout(60_000, undefined, { signal });
        throw new Error("unreachable");
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      const opening = expect(connection.ready).rejects.toMatchObject({
        cause: expect.objectContaining({ name: "AbortError" }),
        code: MllpErrorCode.CONNECTION_FAILED,
      });

      // When
      await connection.destroy();

      // Then
      await opening;
    });

    it("closes a socket that opens after the cancellation anyway", async () => {
      // Given a socket that ignores the signal and opens anyway.
      const { socket, remote } = memorySocket(async (streams) => {
        await setTimeout(20); // opens after the caller has given up
        return streams;
      });
      const connection = createSession(socket, {
        maxBufferedBytes: 1024,
        timeoutMs: 5000,
      });

      const opening = expect(connection.ready).rejects.toMatchObject({
        code: MllpErrorCode.CONNECTION_FAILED,
      });

      // When
      await connection.destroy();
      await opening;

      // Then
      expect(remote.close).toHaveBeenCalled();
    });
  });
});
