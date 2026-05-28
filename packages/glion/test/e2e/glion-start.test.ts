import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { encode as encodeMLLP } from "@glion/mllp";
import { execa } from "execa";
import type { ResultPromise } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import type { Event } from "../../src/events.js";

const fixturesDir = resolve(fileURLToPath(import.meta.url), "..", "fixtures");

const binPath = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "index.js"
);

let currentProc: ResultPromise | null = null;

afterEach(async () => {
  if (currentProc) {
    currentProc.kill("SIGTERM");
    try {
      await currentProc;
    } catch {
      // killing is expected to produce a non-zero exit
    }
    currentProc = null;
  }
});

function readUntilEvent(
  proc: ResultPromise,
  predicate: (event: Event) => boolean,
  timeoutMs = 5000
): Promise<Event> {
  let resolvePromise!: (value: Event) => void;
  let rejectPromise!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new, no-shadow
  const promise = new Promise<Event>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const timer = setTimeout(() => {
    rejectPromise(new Error("timeout waiting for event"));
  }, timeoutMs);
  let buffer = "";
  proc.stdout?.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) {
        try {
          const event = JSON.parse(line) as Event;
          if (predicate(event)) {
            clearTimeout(timer);
            resolvePromise(event);
            return;
          }
        } catch {
          // ignore malformed lines
        }
      }
      newlineIdx = buffer.indexOf("\n");
    }
  });
  return promise;
}

describe("glion start e2e", () => {
  it("starts with an explicit config file and emits ready", async () => {
    currentProc = execa(process.execPath, [binPath, "start"], {
      cwd: resolve(fixturesDir, "minimal"),
      reject: false,
    });
    const ready = await readUntilEvent(currentProc, (e) => e.t === "ready");
    expect(ready.t).toBe("ready");
    if (ready.t === "ready") {
      expect(ready.port).toBeGreaterThan(0);
    }
  });

  it("starts with ephemeral port config and emits ready", async () => {
    currentProc = execa(process.execPath, [binPath, "start"], {
      cwd: resolve(fixturesDir, "zero-config"),
      reject: false,
    });
    const ready = await readUntilEvent(currentProc, (e) => e.t === "ready");
    expect(ready.t).toBe("ready");
    // port: 0 means OS-assigned ephemeral port, so any positive port is valid.
    if (ready.t === "ready") {
      expect(ready.port).toBeGreaterThan(0);
    }
  });

  it("handles a real MLLP message end-to-end", async () => {
    currentProc = execa(process.execPath, [binPath, "start"], {
      cwd: resolve(fixturesDir, "minimal"),
      reject: false,
    });
    const ready = await readUntilEvent(currentProc, (e) => e.t === "ready");
    if (ready.t !== "ready") {
      throw new Error("expected ready event");
    }

    const sample =
      "MSH|^~\\&|X|X|X|X|202604041200||ADT^A01|MSG00001|P|2.5.1\rPID|||1||Doe^John\r";
    const framed = encodeMLLP(sample);
    const msgPromise = readUntilEvent(currentProc, (e) => e.t === "msg", 8000);

    const socket = net.connect(ready.port, "127.0.0.1");
    try {
      let onConnect!: (value: true) => void;
      // oxlint-disable-next-line promise/avoid-new, no-shadow
      const connected = new Promise<true>((resolve) => {
        onConnect = resolve;
      });
      socket.on("connect", () => onConnect(true));
      await connected;
      socket.write(framed);

      const msgEvent = await msgPromise;
      if (msgEvent.t !== "msg") {
        throw new Error("expected msg event");
      }
      expect(msgEvent.trigger).toContain("ADT");
      expect(msgEvent.ack).toBe("AA");
    } finally {
      socket.destroy();
    }
  }, 10_000);

  it("emits a fatal event with kind entry-load-failed when entry path is wrong", async () => {
    currentProc = execa(process.execPath, [binPath, "start"], {
      cwd: resolve(fixturesDir, "bad-entry"),
      reject: false,
    });
    const fatal = await readUntilEvent(currentProc, (e) => e.t === "fatal");
    if (fatal.t === "fatal") {
      expect(fatal.kind).toBe("entry-load-failed");
    }
    const result = await currentProc;
    currentProc = null;
    expect(result.exitCode).not.toBe(0);
  });

  it("emits a fatal event with kind config-invalid when config schema is invalid", async () => {
    currentProc = execa(process.execPath, [binPath, "start"], {
      cwd: resolve(fixturesDir, "bad-schema"),
      reject: false,
    });
    const fatal = await readUntilEvent(currentProc, (e) => e.t === "fatal");
    if (fatal.t === "fatal") {
      expect(fatal.kind).toBe("config-invalid");
    }
    const result = await currentProc;
    currentProc = null;
    expect(result.exitCode).not.toBe(0);
  });
});
