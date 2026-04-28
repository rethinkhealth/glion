import {
  MLLP_END_BYTE_1,
  MLLP_END_BYTE_2,
  MLLP_START_BYTE,
} from "../src/constants.js";
import { encode, encodeMultiple } from "../src/encoder.js";

describe("encode", () => {
  it("should encode a simple ASCII message", () => {
    const message = "MSH|^~\\&|SENDING|FACILITY";
    const result = encode(message);

    // Check start byte
    expect(result[0]).toBe(MLLP_START_BYTE);

    // Check end sequence
    expect(result.at(-2)).toBe(MLLP_END_BYTE_1);
    expect(result.at(-1)).toBe(MLLP_END_BYTE_2);

    // Check message content
    const content = new TextDecoder().decode(result.subarray(1, -2));
    expect(content).toBe(message);
  });

  it("should encode an empty message", () => {
    const result = encode("");

    expect(result.length).toBe(3); // start + end sequence
    expect(result[0]).toBe(MLLP_START_BYTE);
    expect(result[1]).toBe(MLLP_END_BYTE_1);
    expect(result[2]).toBe(MLLP_END_BYTE_2);
  });

  it("should encode a message with special characters", () => {
    const message = "MSH|^~\\&|Test~Rep^Comp&Sub";
    const result = encode(message);

    const content = new TextDecoder().decode(result.subarray(1, -2));
    expect(content).toBe(message);
  });

  it("should encode a message with multi-byte UTF-8 characters", () => {
    const message = "MSH|^~\\&|Patient: \u00E9\u00E0\u00FC\u4E2D\u6587";
    const result = encode(message);

    const content = new TextDecoder().decode(result.subarray(1, -2));
    expect(content).toBe(message);
  });

  it("should encode a Uint8Array input", () => {
    const messageBytes = new Uint8Array([0x4d, 0x53, 0x48]); // "MSH"
    const result = encode(messageBytes);

    expect(result.length).toBe(6); // start + 3 bytes + end sequence
    expect(result[0]).toBe(MLLP_START_BYTE);
    expect(result[1]).toBe(0x4d);
    expect(result[2]).toBe(0x53);
    expect(result[3]).toBe(0x48);
    expect(result[4]).toBe(MLLP_END_BYTE_1);
    expect(result[5]).toBe(MLLP_END_BYTE_2);
  });

  it("should encode a string input", () => {
    const message = "MSH"; // "MSH"
    const result = encode(message);

    expect(result.length).toBe(6); // start + 3 bytes + end sequence
    expect(result[0]).toBe(MLLP_START_BYTE);
    expect(result[1]).toBe(0x4d);
    expect(result[2]).toBe(0x53);
    expect(result[3]).toBe(0x48);
    expect(result[4]).toBe(MLLP_END_BYTE_1);
    expect(result[5]).toBe(MLLP_END_BYTE_2);
  });

  it("should encode a message with newlines", () => {
    const message = "MSH|^~\\&|SENDING\rPID|1||12345";
    const result = encode(message);

    const content = new TextDecoder().decode(result.subarray(1, -2));
    expect(content).toBe(message);
  });
});

describe("encodeMultiple", () => {
  it("should encode multiple messages", () => {
    const messages = ["MSH|1", "MSH|2", "MSH|3"];
    const result = encodeMultiple(messages);

    // Each message: start (1) + content (5) + end (2) = 8 bytes
    // Total: 8 * 3 = 24 bytes
    expect(result.length).toBe(24);

    // Verify first frame
    expect(result[0]).toBe(MLLP_START_BYTE);
    expect(result[6]).toBe(MLLP_END_BYTE_1);
    expect(result[7]).toBe(MLLP_END_BYTE_2);

    // Verify second frame starts at position 8
    expect(result[8]).toBe(MLLP_START_BYTE);
  });

  it("should encode an empty array", () => {
    const result = encodeMultiple([]);
    expect(result.length).toBe(0);
  });

  it("should encode a single message in an array", () => {
    const messages = ["MSH|test"];
    const result = encodeMultiple(messages);
    const singleResult = encode("MSH|test");

    expect(result).toEqual(singleResult);
  });

  it("should encode mixed string and Uint8Array messages", () => {
    const messages = ["MSH|1", new Uint8Array([0x4d, 0x53, 0x48])];
    const result = encodeMultiple(messages);

    // First message: start (1) + "MSH|1" (5) + end (2) = 8 bytes
    // Second message: start (1) + 3 bytes + end (2) = 6 bytes
    expect(result.length).toBe(14);
  });
});
