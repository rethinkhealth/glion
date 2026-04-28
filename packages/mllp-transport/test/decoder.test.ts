import {
  MLLP_END_BYTE_1,
  MLLP_END_BYTE_2,
  MLLP_START_BYTE,
} from "../src/constants.js";
import { decode } from "../src/decoder.js";
import { TransportError } from "../src/errors.js";
import { TransportErrorCode } from "../src/types.js";

/** Wrap raw text in MLLP framing bytes without using the encoder. */
function encode(text: string): Uint8Array {
  const payload = new TextEncoder().encode(text);
  const result = new Uint8Array(payload.length + 3);
  result[0] = MLLP_START_BYTE;
  result.set(payload, 1);
  result[result.length - 2] = MLLP_END_BYTE_1;
  result[result.length - 1] = MLLP_END_BYTE_2;
  return result;
}

describe("decode", () => {
  it("should decode a valid frame", () => {
    const result = decode(encode("MSH|^~\\&|SENDING"));

    expect(result.text).toBe("MSH|^~\\&|SENDING");
    expect(result.byteLength).toBe(16);
    expect(result.data).toBeInstanceOf(Uint8Array);
  });

  it("should decode an empty message", () => {
    const result = decode(
      new Uint8Array([MLLP_START_BYTE, MLLP_END_BYTE_1, MLLP_END_BYTE_2])
    );

    expect(result.text).toBe("");
    expect(result.byteLength).toBe(0);
  });

  it("should decode a message with multi-byte UTF-8", () => {
    const text = "Patient: \u00E9\u00E0\u00FC";
    const result = decode(encode(text));

    expect(result.text).toBe(text);
  });

  it("should throw INVALID_START_BYTE for frame without start byte", () => {
    const data = new Uint8Array([
      0x4d,
      0x53,
      0x48,
      MLLP_END_BYTE_1,
      MLLP_END_BYTE_2,
    ]);

    try {
      decode(data);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError);
      expect((error as TransportError).code).toBe(
        TransportErrorCode.INVALID_START_BYTE
      );
      expect((error as TransportError).position).toBe(0);
    }
  });

  it("should throw INVALID_END_SEQUENCE for frame without end sequence", () => {
    const data = new Uint8Array([MLLP_START_BYTE, 0x4d, 0x53, 0x48, 0x00]);

    try {
      decode(data);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError);
      expect((error as TransportError).code).toBe(
        TransportErrorCode.INVALID_END_SEQUENCE
      );
    }
  });

  it("should throw INVALID_END_SEQUENCE for frame too short", () => {
    const data = new Uint8Array([MLLP_START_BYTE, MLLP_END_BYTE_1]);

    expect(() => decode(data)).toThrow(TransportError);
  });

  it("should throw MESSAGE_TOO_LARGE when exceeding max size", () => {
    try {
      decode(encode("MSH|^~\\&|SENDING|FACILITY"), { maxMessageSize: 5 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TransportError);
      expect((error as TransportError).code).toBe(
        TransportErrorCode.MESSAGE_TOO_LARGE
      );
    }
  });

  it("should not throw for message within max size", () => {
    const result = decode(encode("MSH"), { maxMessageSize: 100 });

    expect(result.text).toBe("MSH");
  });
});
