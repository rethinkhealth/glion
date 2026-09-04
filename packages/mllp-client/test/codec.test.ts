import { AckApplicationError } from "@glion/ack";
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

  /** The `invalid` outcome's cause, for the assertions about why it failed. */
  function causeOf(text: string, expected = controlId): unknown {
    const outcome = decode(encodeBytes(text), expected);
    if (outcome.kind !== "invalid") {
      throw new Error(`expected an invalid outcome, got ${outcome.kind}`);
    }
    return outcome.cause;
  }

  it("reads an accept acknowledgment", () => {
    const text = ack("AA", controlId);

    const outcome = decode(encodeBytes(text), controlId);

    expect(outcome).toMatchObject({
      kind: "accepted",
      response: { code: "AA", raw: text },
    });
    if (outcome.kind === "accepted") {
      expect(outcome.response.tree.type).toBe("root");
    }
  });

  it("reads a NAK as its @glion/ack exception, with the MSA-3 text", () => {
    const text = ack("AE", controlId, "Validation failed");

    const outcome = decode(encodeBytes(text), controlId);

    expect(outcome.kind).toBe("rejected");
    if (outcome.kind === "rejected") {
      expect(outcome.exception).toBeInstanceOf(AckApplicationError);
      expect(outcome.exception).toMatchObject({
        code: "AE",
        controlId,
        text: "Validation failed",
      });
    }
  });

  it("reads ERR-3 and ERR-4 from an ERR segment", () => {
    const text = [
      ack("AE", controlId, "Required field missing"),
      "ERR|||204^Required field missing^HL70357|E|||PID.5",
    ].join("\r");

    const outcome = decode(encodeBytes(text), controlId);

    expect(outcome).toMatchObject({
      exception: {
        code: "AE",
        errorCode: "204",
        severity: "E",
        text: "Required field missing",
      },
      kind: "rejected",
    });
  });

  it("falls back to ERR-8 for the text when MSA-3 is absent", () => {
    const text = [
      ack("AR", controlId),
      "ERR|||207^Application error^HL70357|E||||Try again later",
    ].join("\r");

    expect(decode(encodeBytes(text), controlId)).toMatchObject({
      exception: { code: "AR", text: "Try again later" },
      kind: "rejected",
    });
  });

  it("is invalid when MSA-1 is empty", () => {
    const cause = causeOf(ack("", controlId));

    expect(cause).toBeInstanceOf(UnexpectedAcknowledgmentError);
    expect(cause).toMatchObject({
      message: expect.stringContaining("MSA-1 is empty"),
    });
  });

  it("is invalid when MSA-1 is not an acknowledgment code", () => {
    expect(causeOf(ack("OK", controlId))).toMatchObject({
      message: expect.stringContaining('MSA-1 is "OK"'),
    });
  });

  it("is invalid when there is no MSA segment", () => {
    const text = ack("AA", controlId).split("\r")[0] ?? "";

    expect(causeOf(text)).toBeInstanceOf(UnexpectedAcknowledgmentError);
  });

  it("is invalid when MSA-2 is empty", () => {
    expect(causeOf(ack("AA", ""))).toMatchObject({
      message: expect.stringContaining("MSA-2 is empty"),
    });
  });

  it("is invalid when MSA-2 names another message", () => {
    expect(causeOf(ack("AA", "OTHER"))).toMatchObject({
      message: expect.stringContaining(
        `MSA-2 is "OTHER", which does not match the message's MSH-10 "${controlId}"`
      ),
    });
  });

  it("is invalid, with the charset error as cause, when the bytes are not UTF-8", () => {
    const outcome = decode(
      new Uint8Array([0xff, 0xfe, 0x4d, 0x53, 0x48]),
      controlId
    );

    expect(outcome).toMatchObject({ kind: "invalid" });
    if (outcome.kind === "invalid") {
      expect(outcome.cause).toBeInstanceOf(CharsetError);
    }
  });
});
