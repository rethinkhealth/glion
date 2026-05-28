import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { readLines } from "../../src/parent/line-reader.js";

/**
 * Waits one macrotask so any queued `data`/`end` events on a
 * PassThrough have been delivered.
 */
function flush(): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve();
    });
  });
}

describe("readLines", () => {
  it("emits each complete line as it arrives in a single chunk", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => {
      lines.push(line);
    });

    stream.write("hello\nworld\n");
    await flush();

    expect(lines).toEqual(["hello", "world"]);
  });

  it("buffers partial content across chunks until a newline arrives", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => {
      lines.push(line);
    });

    stream.write("hel");
    await flush();
    expect(lines).toEqual([]);

    stream.write("lo\nwor");
    await flush();
    expect(lines).toEqual(["hello"]);

    stream.write("ld\n");
    await flush();
    expect(lines).toEqual(["hello", "world"]);
  });

  it("flushes a partial trailing line when the stream ends", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => {
      lines.push(line);
    });

    stream.write("complete\n");
    stream.write("partial-no-newline");
    stream.end();
    await flush();

    // The "partial-no-newline" must still be delivered — this is the
    // path that fires when a child is SIGKILLed mid-write of a fatal
    // event.
    expect(lines).toEqual(["complete", "partial-no-newline"]);
  });

  it("does not emit anything from an empty stream", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => {
      lines.push(line);
    });

    stream.end();
    await flush();

    expect(lines).toEqual([]);
  });

  it("drops lines that exceed maxLineLength and reports the byte count", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    const overflows: number[] = [];
    readLines(
      stream,
      (line) => {
        lines.push(line);
      },
      {
        maxLineLength: 10,
        onOverflow: (bytes) => {
          overflows.push(bytes);
        },
      }
    );

    stream.write("short\n");
    stream.write("this-line-is-way-too-long-for-the-cap\n");
    stream.write("after\n");
    await flush();

    expect(lines).toEqual(["short", "after"]);
    expect(overflows).toHaveLength(1);
    // Reported count should be roughly the length of the dropped line.
    expect(overflows[0]).toBeGreaterThan(10);
  });

  it("accepts lines at exactly maxLineLength (boundary is inclusive-ish)", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    const overflows: number[] = [];
    readLines(
      stream,
      (line) => {
        lines.push(line);
      },
      {
        maxLineLength: 5,
        onOverflow: (bytes) => {
          overflows.push(bytes);
        },
      }
    );

    stream.write("12345\n"); // exactly 5 bytes of payload
    stream.write("123456\n"); // 6 bytes — one over
    await flush();

    expect(lines).toEqual(["12345"]);
    expect(overflows).toHaveLength(1);
  });

  it("resyncs to the next newline after an overflow mid-chunk", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    const overflows: number[] = [];
    readLines(
      stream,
      (line) => {
        lines.push(line);
      },
      {
        maxLineLength: 5,
        onOverflow: (bytes) => {
          overflows.push(bytes);
        },
      }
    );

    // Oversized line arrives in multiple chunks WITHOUT a newline.
    // The buffer must never be allowed to grow past the cap while the
    // reader is waiting for the newline — that's the DoS this whole
    // fix is about. Only after the newline arrives does `after` emit.
    stream.write("too-long-chunk-1-"); // 17 bytes, over cap
    stream.write("more-");
    stream.write("pieces\n");
    stream.write("after\n");
    await flush();

    expect(lines).toEqual(["after"]);
    expect(overflows).toHaveLength(1);
  });

  it("keeps reading after overflow — does not wedge the stream", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(
      stream,
      (line) => {
        lines.push(line);
      },
      { maxLineLength: 5 }
    );

    stream.write("longer-than-cap\n");
    stream.write("small\n");
    stream.write("also-way-too-long\n");
    stream.write("ok\n");
    await flush();

    expect(lines).toEqual(["small", "ok"]);
  });

  it("handles multi-byte UTF-8 characters split across chunk boundaries", async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => {
      lines.push(line);
    });

    // "é" is 0xC3 0xA9 in UTF-8. Split it across two chunks to make
    // sure the decoder (setEncoding) buffers the partial bytes.
    stream.write(Buffer.from([0x61, 0xc3])); // "a" + first byte of "é"
    stream.write(Buffer.from([0xa9, 0x0a])); // second byte of "é" + "\n"
    await flush();

    expect(lines).toEqual(["aé"]);
  });
});
