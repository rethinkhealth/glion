import {
  createDecoderStream,
  MLLPDecoderStream,
} from "../src/decoder-stream.js";
import { encode, encodeMultiple } from "../src/encoder.js";
import type { DecodedMessage } from "../src/types.js";
import { TransportErrorCode } from "../src/types.js";

/**
 * Helper to collect all messages from a decoder stream
 */
async function collectMessages(
  stream: ReadableStream<DecodedMessage>
): Promise<DecodedMessage[]> {
  const reader = stream.getReader();
  const messages: DecodedMessage[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    messages.push(value);
  }

  return messages;
}

/**
 * Helper to write chunks to a decoder and collect results.
 * Uses concurrent read/write to avoid backpressure deadlock.
 */
async function decodeChunks(
  chunks: Uint8Array[],
  options?: Parameters<typeof createDecoderStream>[0]
): Promise<DecodedMessage[]> {
  const decoder = createDecoderStream(options);
  const writer = decoder.writable.getWriter();

  // Start reading concurrently to avoid backpressure deadlock
  const readPromise = collectMessages(decoder.readable);

  // Write all chunks
  for (const chunk of chunks) {
    await writer.write(chunk);
  }
  await writer.close();

  // Wait for reading to complete
  return readPromise;
}

describe("createDecoderStream", () => {
  it("should decode a single message arriving in one chunk", async () => {
    const frame = encode("MSH|^~\\&|TEST");
    const messages = await decodeChunks([frame]);

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("MSH|^~\\&|TEST");
  });

  it("should decode a message split across multiple chunks", async () => {
    const frame = encode("MSH|^~\\&|TEST");

    // Split the frame into multiple chunks
    const chunk1 = frame.subarray(0, 5);
    const chunk2 = frame.subarray(5, 10);
    const chunk3 = frame.subarray(10);

    const messages = await decodeChunks([chunk1, chunk2, chunk3]);

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("MSH|^~\\&|TEST");
  });

  it("should decode a message arriving byte by byte", async () => {
    const frame = encode("MSH");
    const chunks = [...frame].map((byte) => new Uint8Array([byte]));

    const messages = await decodeChunks(chunks);

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("MSH");
  });

  it("should decode multiple messages in a single chunk", async () => {
    const data = encodeMultiple(["MSG1", "MSG2", "MSG3"]);
    const messages = await decodeChunks([data]);

    expect(messages.length).toBe(3);
    expect(messages[0]?.text).toBe("MSG1");
    expect(messages[1]?.text).toBe("MSG2");
    expect(messages[2]?.text).toBe("MSG3");
  });

  it("should handle interleaved partial messages", async () => {
    const frame1 = encode("MSG1");
    const frame2 = encode("MSG2");

    // Send complete frame1, then partial frame2, then rest of frame2
    const properChunk1 = new Uint8Array([...frame1, ...frame2.subarray(0, 3)]);
    const properChunk2 = frame2.subarray(3);

    const messages = await decodeChunks([properChunk1, properChunk2]);

    expect(messages.length).toBe(2);
    expect(messages[0]?.text).toBe("MSG1");
    expect(messages[1]?.text).toBe("MSG2");
  });

  it("should respect maxMessageSize limit", async () => {
    const onError = vi.fn();
    const largeMessage = "A".repeat(100);
    const frame = encode(largeMessage);

    const messages = await decodeChunks([frame], {
      maxMessageSize: 50,
      onError,
    });

    // Message should be skipped
    expect(messages.length).toBe(0);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0].code).toBe(
      TransportErrorCode.MESSAGE_TOO_LARGE
    );
  });

  it("should call onError for incomplete message at stream end", async () => {
    const onError = vi.fn();
    const frame = encode("MSH|TEST");
    // Remove the end sequence to make it incomplete
    const incomplete = frame.subarray(0, -2);

    await decodeChunks([incomplete], { onError });

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0].code).toBe(
      TransportErrorCode.INCOMPLETE_MESSAGE
    );
  });

  it("should skip malformed data and continue", async () => {
    const onError = vi.fn();

    // Garbage data followed by a valid frame
    const garbage = new Uint8Array([0x00, 0x01, 0x02]);
    const validFrame = encode("VALID");
    const combined = new Uint8Array([...garbage, ...validFrame]);

    const messages = await decodeChunks([combined], { onError });

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("VALID");
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0]?.[0].code).toBe(
      TransportErrorCode.INVALID_START_BYTE
    );
  });

  it("should handle empty chunks", async () => {
    const frame = encode("MSH");
    const chunks = [
      new Uint8Array(0),
      frame.subarray(0, 3),
      new Uint8Array(0),
      frame.subarray(3),
      new Uint8Array(0),
    ];

    const messages = await decodeChunks(chunks);

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("MSH");
  });

  it("should work with piped streams", async () => {
    const frames = encodeMultiple(["MSH|1", "MSH|2"]);

    const source = new ReadableStream({
      start(controller) {
        controller.enqueue(frames);
        controller.close();
      },
    });

    const decoder = createDecoderStream();
    const messages = await collectMessages(source.pipeThrough(decoder));

    expect(messages.length).toBe(2);
    expect(messages[0]?.text).toBe("MSH|1");
    expect(messages[1]?.text).toBe("MSH|2");
  });

  it("should decode messages with multi-byte UTF-8", async () => {
    const message = "Patient: \u00E9\u00E0\u00FC\u4E2D\u6587";
    const frame = encode(message);

    const messages = await decodeChunks([frame]);

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe(message);
  });

  it("should provide correct byteLength", async () => {
    const message = "MSH|^~\\&|SENDING";
    const frame = encode(message);

    const messages = await decodeChunks([frame]);

    expect(messages[0]?.byteLength).toBe(
      new TextEncoder().encode(message).length
    );
  });
});

describe("createDecoderStream — garbage and edge cases", () => {
  it("should report garbage-only data with no VT byte", async () => {
    const onError = vi.fn();
    const garbage = new Uint8Array([0x41, 0x42, 0x43]); // "ABC" — no VT

    const messages = await decodeChunks([garbage], { onError });

    expect(messages.length).toBe(0);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: TransportErrorCode.INVALID_START_BYTE,
      })
    );
  });

  it("should report garbage bytes before VT in a separate chunk", async () => {
    const onError = vi.fn();
    // First chunk: garbage only; second chunk: valid frame
    const garbage = new Uint8Array([0x41, 0x42]);
    const validFrame = encode("VALID");

    const messages = await decodeChunks([garbage, validFrame], { onError });

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("VALID");
    expect(onError).toHaveBeenCalled();
  });

  it("should abandon frame mid-accumulation when maxMessageSize exceeded across chunks", async () => {
    const onError = vi.fn();
    // Build a frame manually: VT + payload chunks (no end sequence yet)
    const startByte = new Uint8Array([0x0b]);
    const payload = new Uint8Array(60).fill(0x41); // 60 bytes of 'A'

    // Send VT + first payload chunk, then more payload to exceed limit
    const chunk1 = new Uint8Array([...startByte, ...payload.subarray(0, 30)]);
    const chunk2 = payload.subarray(30); // 30 more bytes, total 60 > maxMessageSize

    // Then send a valid frame to prove decoder recovers
    const validFrame = encode("RECOVERED");

    const messages = await decodeChunks([chunk1, chunk2, validFrame], {
      maxMessageSize: 50,
      onError,
    });

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("RECOVERED");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: TransportErrorCode.MESSAGE_TOO_LARGE,
      })
    );
  });

  it("should compact partial frame when messageStartPos > 0", async () => {
    // garbage + VT + partial payload (no end sequence) across chunks
    // This forces messageStartPos > 0 on the first chunk, triggering compaction
    const onError = vi.fn();
    const garbage = new Uint8Array([0x41, 0x42]); // 2 bytes garbage
    const startByte = new Uint8Array([0x0b]);
    const partialPayload = new Uint8Array([0x4d, 0x53, 0x48]); // "MSH"

    // chunk1: garbage + VT + partial payload (no end sequence)
    const chunk1 = new Uint8Array([
      ...garbage,
      ...startByte,
      ...partialPayload,
    ]);
    // chunk2: rest of payload + end sequence
    const endSeq = new Uint8Array([0x1c, 0x0d]);
    const restPayload = new Uint8Array([0x7c, 0x54, 0x45, 0x53, 0x54]); // "|TEST"
    const chunk2 = new Uint8Array([...restPayload, ...endSeq]);

    const messages = await decodeChunks([chunk1, chunk2], { onError });

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("MSH|TEST");
    // Garbage before VT was reported
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: TransportErrorCode.INVALID_START_BYTE,
      })
    );
  });
});

describe("MLLPDecoderStream", () => {
  it("should work as a class instance", async () => {
    const decoder = new MLLPDecoderStream();
    const writer = decoder.writable.getWriter();

    // Start reading concurrently
    const readPromise = collectMessages(decoder.readable);

    const frame = encode("TEST");
    await writer.write(frame);
    await writer.close();

    const messages = await readPromise;

    expect(messages.length).toBe(1);
    expect(messages[0]?.text).toBe("TEST");
  });

  it("should accept options", async () => {
    const onError = vi.fn();
    const decoder = new MLLPDecoderStream({
      maxMessageSize: 10,
      onError,
    });

    const writer = decoder.writable.getWriter();

    // Start reading concurrently
    const readPromise = collectMessages(decoder.readable);

    const frame = encode("A".repeat(20));
    await writer.write(frame);
    await writer.close();

    const messages = await readPromise;

    expect(messages.length).toBe(0);
    expect(onError).toHaveBeenCalled();
  });
});

describe("createDecoderStream — fatal error mode (onError throws)", () => {
  // Throwing from inside the user-supplied onError callback is the
  // documented way to opt into "fatal" framing-error semantics: the
  // throw propagates out of the underlying transform() call and errors
  // both sides of the TransformStream. These tests pin that contract
  // so consumers (e.g. @glion/mllp-client) can rely on it.
  //
  // Each test ignores the writer.write() rejection because both sides
  // of a TransformStream error simultaneously when the transformer
  // throws. The contract under test is the *readable* rejection — that
  // is what `for await ... of` consumers observe.

  function ignoreRejection<T>(promise: Promise<T>): void {
    promise.catch(() => {
      /* observed elsewhere; suppress unhandled-rejection warning */
    });
  }

  it("errors the readable when onError throws on garbage bytes", async () => {
    const fatal = new Error("garbage in stream");
    const decoder = createDecoderStream({
      onError: () => {
        throw fatal;
      },
    });

    const writer = decoder.writable.getWriter();
    const readPromise = collectMessages(decoder.readable);

    // Send garbage with no VT — triggers INVALID_START_BYTE inside transform().
    ignoreRejection(writer.write(new Uint8Array([0x01, 0x02, 0x03])));

    await expect(readPromise).rejects.toBe(fatal);
  });

  it("errors the readable when onError throws on oversized frame", async () => {
    const fatal = new Error("too big");
    const decoder = createDecoderStream({
      maxMessageSize: 5,
      onError: () => {
        throw fatal;
      },
    });

    const writer = decoder.writable.getWriter();
    const readPromise = collectMessages(decoder.readable);

    ignoreRejection(writer.write(encode("0123456789"))); // payload exceeds 5

    await expect(readPromise).rejects.toBe(fatal);
  });

  it("preserves the thrown value verbatim through the rejection", async () => {
    class CustomFramingError extends Error {
      readonly tag = "custom" as const;
    }
    const fatal = new CustomFramingError("framing failed");

    const decoder = createDecoderStream({
      onError: () => {
        throw fatal;
      },
    });

    const writer = decoder.writable.getWriter();
    const readPromise = collectMessages(decoder.readable);

    ignoreRejection(writer.write(new Uint8Array([0xff])));

    try {
      await readPromise;
      expect.fail("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomFramingError);
      expect((error as CustomFramingError).tag).toBe("custom");
    }
  });
});
