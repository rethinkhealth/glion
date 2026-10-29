import { describe, expect, it } from "vitest";

import {
  readEncodingCharacters,
  readMessageHeader,
} from "../src/message-header";

const DELIMITERS = { field: "|", segment: "\r" };

const encodingCharacters = (input: string, field = "|"): string | undefined => {
  const header = readMessageHeader(input, "\r");
  return (
    header && readEncodingCharacters(input, header, { ...DELIMITERS, field })
  );
};

describe(readMessageHeader, () => {
  it("reads MSH-1 as the character after MSH, and MSH-2 as starting after it", () => {
    expect(readMessageHeader("MSH*%$#&*APP", "\r")).toStrictEqual({
      encodingCharactersStart: 4,
      fieldSeparator: "*",
    });
  });

  it("reads an empty MSH-1 when the input ends after MSH", () => {
    expect(readMessageHeader("MSH", "\r")).toStrictEqual({
      encodingCharactersStart: 4,
      fieldSeparator: "",
    });
  });

  it("reads no message header when the message opens with another segment", () => {
    expect(readMessageHeader("PID|1", "\r")).toBeUndefined();
  });

  it("reads no message header when a segment terminator follows MSH", () => {
    expect(readMessageHeader("MSH\rPID|1", "\r")).toBeUndefined();
    expect(readMessageHeader("MSH\r\nPID|1", "\r")).toBeUndefined();
    expect(readMessageHeader("MSH\nPID|1", "\r")).toBeUndefined();
    expect(readMessageHeader("MSH$PID|1", "$")).toBeUndefined();
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

  it("ends at the end of the input", () => {
    expect(encodingCharacters("MSH|^~")).toBe("^~");
    expect(encodingCharacters("MSH")).toBe("");
  });
});
