import { MllpCodecError } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError, decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import {
  decode,
  encode,
  MissingControlIdError,
  UnexpectedAcknowledgmentError,
} from "../src/codec";
import { ack, adtA01, controlIdOf } from "./fixtures";

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

/** The payload of one MLLP frame, decoded to text. */
function payloadOf(framed: Uint8Array): string {
  return decodeBytes(framed.subarray(1, -2));
}

describe("encode()", () => {
  it("frames the canonical serialization and reads MSH-10", () => {
    const message = adtA01();

    const { framed, controlId } = encode(message);

    expect(controlId).toBe(controlIdOf(message));
    expect(framed[0]).toBe(VT);
    expect(framed.at(-2)).toBe(FS);
    expect(framed.at(-1)).toBe(CR);
    expect(payloadOf(framed)).toBe(toHl7v2(parseHL7v2(message)));
  });

  it("accepts a parsed tree and produces the same frame as its text", () => {
    const message = adtA01();

    expect(encode(parseHL7v2(message))).toEqual(encode(message));
  });

  it("normalizes line endings to CR on the wire", () => {
    const message = adtA01();

    const { framed } = encode(message.replaceAll("\r", "\n"));

    expect(payloadOf(framed)).toBe(toHl7v2(parseHL7v2(message)));
  });

  it("throws MissingControlIdError when MSH-10 is empty", () => {
    expect(() => encode(adtA01(""))).toThrow(MissingControlIdError);
  });

  it("lets the framing error through when the message carries a reserved byte", () => {
    const message = adtA01().replace("Doe", "Doe");

    expect(() => encode(message)).toThrow(MllpCodecError);
  });
});

describe("decode()", () => {
  const message = adtA01();
  const controlId = controlIdOf(message);

  it("reads an accept acknowledgment", () => {
    const text = ack("AA", controlId);

    const result = decode(encodeBytes(text), controlId);

    expect(result).toMatchObject({ code: "AA", raw: text });
    expect(result.tree.type).toBe("root");
    expect(result.text).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
    expect(result.severity).toBeUndefined();
  });

  it("reads a NAK with its MSA-3 text", () => {
    const text = ack("AE", controlId, "Validation failed");

    expect(decode(encodeBytes(text), controlId)).toMatchObject({
      code: "AE",
      text: "Validation failed",
    });
  });

  it("reads ERR-3 and ERR-4 from an ERR segment", () => {
    const text = [
      ack("AE", controlId, "Required field missing"),
      "ERR|||204^Required field missing^HL70357|E|||PID.5",
    ].join("\r");

    expect(decode(encodeBytes(text), controlId)).toMatchObject({
      code: "AE",
      errorCode: "204",
      severity: "E",
      text: "Required field missing",
    });
  });

  it("falls back to ERR-8 for the text when MSA-3 is absent", () => {
    const text = [
      ack("AR", controlId),
      "ERR|||207^Application error^HL70357|E||||Try again later",
    ].join("\r");

    expect(decode(encodeBytes(text), controlId)).toMatchObject({
      code: "AR",
      text: "Try again later",
    });
  });

  it("throws UnexpectedAcknowledgmentError when MSA-1 is empty", () => {
    const text = ack("", controlId);

    expect(() => decode(encodeBytes(text), controlId)).toThrow(
      UnexpectedAcknowledgmentError
    );
    expect(() => decode(encodeBytes(text), controlId)).toThrow(
      "MSA-1 is empty"
    );
  });

  it("throws UnexpectedAcknowledgmentError when MSA-1 is not an acknowledgment code", () => {
    const text = ack("OK", controlId);

    expect(() => decode(encodeBytes(text), controlId)).toThrow('MSA-1 is "OK"');
  });

  it("throws UnexpectedAcknowledgmentError when there is no MSA segment", () => {
    const text = ack("AA", controlId).split("\r")[0] ?? "";

    expect(() => decode(encodeBytes(text), controlId)).toThrow(
      UnexpectedAcknowledgmentError
    );
  });

  it("throws UnexpectedAcknowledgmentError when MSA-2 is empty", () => {
    const text = ack("AA", "");

    expect(() => decode(encodeBytes(text), controlId)).toThrow(
      "MSA-2 is empty"
    );
  });

  it("throws UnexpectedAcknowledgmentError when MSA-2 names another message", () => {
    const text = ack("AA", "OTHER");

    expect(() => decode(encodeBytes(text), controlId)).toThrow(
      `MSA-2 is "OTHER", which does not match the message's MSH-10 "${controlId}"`
    );
  });

  it("lets the charset error through when the bytes are not UTF-8", () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x4d, 0x53, 0x48]);

    expect(() => decode(bytes, controlId)).toThrow(CharsetError);
  });
});
