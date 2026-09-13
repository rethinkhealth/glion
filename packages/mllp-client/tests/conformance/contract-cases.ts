/**
 * The `MllpSocket` contract as cases: each opens a socket the runner built,
 * drives it, and returns what it observed. Runtime-neutral: Web Streams,
 * timers, and `AbortController` only, so a case runs wherever the socket
 * under test runs.
 *
 * @module
 */

import { frame } from "@glion/mllp-codec";
import { decodeBytes, encodeBytes } from "@glion/util-charset";

import type { MllpSocket, MllpStreams } from "../../src/index";
import { adtA01 } from "../fixtures";
import type {
  ContractOutcome,
  ReadSettlement,
  ReceiverBehaviour,
  Settlement,
} from "./types";

/** Longer than any case legitimately takes; shorter than a test timeout. */
const GUARD_MS = 2000;

const ONE_MIB = 1024 * 1024;

export type ContractCaseId =
  | "C1-abort-mid-attempt"
  | "C2-already-aborted"
  | "C3-refused-leaves-nothing-open"
  | "C4-close-never-rejects"
  | "C5-close-idempotent"
  | "C6-close-bounded-without-fin"
  | "C7-close-after-peer-dropped"
  | "C8-read-settles-on-reset"
  | "C9-read-settles-on-fin"
  | "C10-bytes-before-fin"
  | "C11-close-while-locked"
  | "C12-large-round-trip"
  | "C13-fin-on-close";

export interface ContractCase {
  /** The rule from `MllpSocket`'s documentation this case checks. */
  readonly rule: string;
  readonly receiver: ReceiverBehaviour;
  run(socket: MllpSocket): Promise<ContractOutcome>;
}

function now(): number {
  return performance.now();
}

/** How `promise` settled within `GUARD_MS`. Never rejects. */
async function settle(promise: Promise<unknown>): Promise<Settlement> {
  let guard: ReturnType<typeof setTimeout> | undefined;
  // oxlint-disable-next-line promise/avoid-new -- a timer as a promise
  const timeout = new Promise<"timeout">((resolve) => {
    guard = setTimeout(() => resolve("timeout"), GUARD_MS);
  });
  try {
    return await Promise.race([
      promise.then(
        (): Settlement => "fulfilled",
        (): Settlement => "rejected"
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(guard);
  }
}

/** How the next read on `reader` settled within `GUARD_MS`. */
async function settleRead(
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<ReadSettlement> {
  let guard: ReturnType<typeof setTimeout> | undefined;
  // oxlint-disable-next-line promise/avoid-new -- a timer as a promise
  const timeout = new Promise<"timeout">((resolve) => {
    guard = setTimeout(() => resolve("timeout"), GUARD_MS);
  });
  try {
    return await Promise.race([
      reader.read().then(
        (result): ReadSettlement => (result.done ? "done" : "value"),
        (): ReadSettlement => "error"
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(guard);
  }
}

/**
 * Reads until `reader` ends, errors, `minBytes` have arrived, or the guard
 * fires. Returns the bytes and how the last read settled.
 */
async function drain(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  minBytes: number
): Promise<{ bytes: Uint8Array; last: ReadSettlement }> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let last: ReadSettlement = "value";
  const deadline = now() + GUARD_MS;
  while (total < minBytes && now() < deadline) {
    const result = await reader.read().then(
      (read) => read,
      () => null
    );
    if (result === null) {
      last = "error";
      break;
    }
    if (result.done) {
      last = "done";
      break;
    }
    chunks.push(result.value);
    total += result.value.length;
  }
  if (total < minBytes && last === "value") {
    last = "timeout";
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { bytes, last };
}

/** One ADT^A01, framed. */
function message(): Uint8Array {
  return frame(encodeBytes(adtA01().text));
}

async function open(socket: MllpSocket): Promise<MllpStreams> {
  return await socket.connect(new AbortController().signal);
}

async function timedClose(socket: MllpSocket): Promise<number> {
  const started = now();
  await socket.close();
  return now() - started;
}

export const contractCases: Readonly<Record<ContractCaseId, ContractCase>> = {
  "C1-abort-mid-attempt": {
    receiver: "blackhole",
    rule: "connect() rejects with signal.reason when the signal aborts",
    async run(socket) {
      const controller = new AbortController();
      const reason = new Error("the caller gave up");
      const opening = socket.connect(controller.signal);
      setTimeout(() => controller.abort(reason), 5);
      const rejectedWith = await opening.then(
        () => "fulfilled",
        (error: unknown) => (error === reason ? "reason" : "other")
      );
      return { closeMs: await timedClose(socket), rejectedWith };
    },
  },
  "C10-bytes-before-fin": {
    receiver: "acknowledgesThenEnds",
    rule: "bytes sent before a clean close arrive before end-of-stream",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      await writer.write(message());
      const { bytes, last } = await drain(reader, Number.POSITIVE_INFINITY);
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
      return {
        containsAcknowledgment: decodeBytes(bytes).includes("MSA|AA|"),
        last,
      };
    },
  },
  "C11-close-while-locked": {
    receiver: "acknowledges",
    rule: "close() resolves while the streams are locked",
    async run(socket) {
      const { readable, writable } = await open(socket);
      readable.getReader();
      writable.getWriter();
      const started = now();
      const close = await settle(socket.close());
      return { close, closeMs: now() - started };
    },
  },
  "C12-large-round-trip": {
    receiver: "echoes",
    rule: "a 1 MiB write round-trips under backpressure",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      const sent = new Uint8Array(ONE_MIB);
      for (let i = 0; i < sent.length; i += 1) {
        sent[i] = i % 251;
      }
      const writing = writer.write(sent);
      const { bytes, last } = await drain(reader, ONE_MIB);
      await writing;
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
      let equal = bytes.length === sent.length;
      for (let i = 0; equal && i < sent.length; i += 1) {
        equal = bytes[i] === sent[i];
      }
      return { echoed: bytes.length, equal, last };
    },
  },
  "C13-fin-on-close": {
    receiver: "acknowledges",
    rule: "close() after an exchange ends the socket gracefully",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      await writer.write(message());
      const read = await settleRead(reader);
      reader.releaseLock();
      writer.releaseLock();
      return { close: await settle(socket.close()), read };
    },
  },
  "C2-already-aborted": {
    receiver: "acknowledges",
    rule: "connect() rejects with signal.reason when the signal is already aborted",
    async run(socket) {
      const reason = new Error("the caller gave up");
      const rejectedWith = await socket.connect(AbortSignal.abort(reason)).then(
        () => "fulfilled",
        (error: unknown) => (error === reason ? "reason" : "other")
      );
      return { closeMs: await timedClose(socket), rejectedWith };
    },
  },
  "C3-refused-leaves-nothing-open": {
    receiver: "refuses",
    rule: "a rejected connect() leaves nothing open",
    async run(socket) {
      const opening = await settle(open(socket));
      return { closeMs: await timedClose(socket), opening };
    },
  },
  "C4-close-never-rejects": {
    receiver: "acknowledges",
    rule: "close() never rejects",
    async run(socket) {
      await open(socket);
      return { close: await settle(socket.close()) };
    },
  },
  "C5-close-idempotent": {
    receiver: "acknowledges",
    rule: "close() is idempotent",
    async run(socket) {
      await open(socket);
      const concurrent = await Promise.all([
        settle(socket.close()),
        settle(socket.close()),
        settle(socket.close()),
      ]);
      const after = await settle(socket.close());
      return { after, concurrent: concurrent.join(",") };
    },
  },
  "C6-close-bounded-without-fin": {
    receiver: "holdsOpen",
    rule: "close() is bounded even when the remote system never answers",
    async run(socket) {
      await open(socket);
      return { closeMs: await timedClose(socket) };
    },
  },
  "C7-close-after-peer-dropped": {
    receiver: "dropsAfterRead",
    rule: "close() resolves after the remote system has dropped",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      await writer.write(message());
      const read = await settleRead(reader);
      reader.releaseLock();
      writer.releaseLock();
      return { close: await settle(socket.close()), read };
    },
  },
  "C8-read-settles-on-reset": {
    receiver: "dropsAfterRead",
    rule: "a pending read settles when the remote system resets",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      await writer.write(message());
      const read = await settleRead(reader);
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
      return { read };
    },
  },
  "C9-read-settles-on-fin": {
    receiver: "endsAfterRead",
    rule: "a pending read ends when the remote system sends FIN",
    async run(socket) {
      const { readable, writable } = await open(socket);
      const writer = writable.getWriter();
      const reader = readable.getReader();
      await writer.write(message());
      const read = await settleRead(reader);
      reader.releaseLock();
      writer.releaseLock();
      await socket.close();
      return { read };
    },
  },
};

export const contractCaseIds = Object.keys(contractCases) as ContractCaseId[];
