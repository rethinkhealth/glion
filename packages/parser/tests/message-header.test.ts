import { describe, expect, it } from "vitest";

import {
  readEncodingCharacters,
  readMessageHeader,
} from "../src/message-header";

const LINE_BREAKS = { lineBreaks: true, segment: "\r" };
const SEGMENT_DELIMITER_ONLY = { lineBreaks: false, segment: "\r" };

const encodingCharacters = (
  input: string,
  field = "|",
  segmentEnd = LINE_BREAKS
): string | undefined => {
  const header = readMessageHeader(input, segmentEnd);
  return header && readEncodingCharacters(input, header, field, segmentEnd);
};

describe(readMessageHeader, () => {
  it("reads MSH-1 as the character after MSH, and MSH-2 as starting after it", () => {
    expect(readMessageHeader("MSH*%$#&*APP", LINE_BREAKS)).toStrictEqual({
      encodingCharactersStart: 4,
      fieldSeparator: "*",
    });
  });

  it("reads an empty MSH-1 when the input ends after MSH", () => {
    expect(readMessageHeader("MSH", LINE_BREAKS)).toStrictEqual({
      encodingCharactersStart: 4,
      fieldSeparator: "",
    });
  });

  it("reads a line feed after MSH as MSH-1 without line breaks", () => {
    expect(
      readMessageHeader("MSH\nPID|1", SEGMENT_DELIMITER_ONLY)
    ).toStrictEqual({ encodingCharactersStart: 4, fieldSeparator: "\n" });
  });

  it("reads no message header when the message opens with another segment", () => {
    expect(readMessageHeader("PID|1", LINE_BREAKS)).toBeUndefined();
  });

  it("reads no message header when a segment terminator follows MSH", () => {
    expect(readMessageHeader("MSH\rPID|1", LINE_BREAKS)).toBeUndefined();
    expect(readMessageHeader("MSH\r\nPID|1", LINE_BREAKS)).toBeUndefined();
    expect(readMessageHeader("MSH\nPID|1", LINE_BREAKS)).toBeUndefined();
    expect(
      readMessageHeader("MSH$PID|1", { lineBreaks: true, segment: "$" })
    ).toBeUndefined();
  });
});

describe(readEncodingCharacters, () => {
  it("reads the four characters MSH-2 declares", () => {
    expect(encodingCharacters("MSH|^~\\&|APP")).toBe("^~\\&");
  });

  it("reads no more than four characters", () => {
    expect(encodingCharacters("MSH|^~\\&#|APP")).toBe("^~\\&");
  });

  it("ends at the field delimiter before the fourth character", () => {
    expect(encodingCharacters("MSH|^~\\|APP")).toBe("^~\\");
  });

  it("ends at the field delimiter it is given", () => {
    expect(encodingCharacters("MSH|^~*&|APP", "*")).toBe("^~");
  });

  it("ends at a segment terminator before the fourth character", () => {
    expect(encodingCharacters("MSH|^~\\\rPID|1")).toBe("^~\\");
    expect(encodingCharacters("MSH|^~\\\r\nPID|1")).toBe("^~\\");
  });

  it("reads a line feed as an encoding character without line breaks", () => {
    expect(
      encodingCharacters("MSH|^~\n&|APP", "|", SEGMENT_DELIMITER_ONLY)
    ).toBe("^~\n&");
  });

  it("ends at the end of the input", () => {
    expect(encodingCharacters("MSH|^~")).toBe("^~");
    expect(encodingCharacters("MSH")).toBe("");
  });
});
