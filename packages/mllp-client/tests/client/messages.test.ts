/**
 * `encode()` and `decode()`: one tree to the bytes it is sent as, and received
 * bytes to what they turned out to be as a reply to it.
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
  AckException,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { CharsetError, decodeBytes, encodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { decode, encode } from "../../src/client/messages";
import {
  MllpClientError,
  MllpInvalidMessageError,
  MllpInvalidResponseError,
} from "../../src/errors";
import { ack, adtA01 } from "../fixtures";

describe("encode()", () => {
  describe("a message it can send", () => {
    it("carries the tree's canonical serialization", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text);

      expect(decodeBytes(encode(tree).bytes)).toBe(toHl7v2(tree));
    });

    it("encodes the bytes as UTF-8", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text.replace("Doe^John", "Dôe^Jöhn"));

      expect(decodeBytes(encode(tree).bytes)).toContain("Dôe^Jöhn");
    });

    it("reports the MSH-10 its acknowledgment must echo", () => {
      const { controlId, tree } = adtA01();

      expect(encode(tree).controlId).toBe(controlId);
    });
  });

  describe("a message it cannot send", () => {
    it("throws when the message has no MSH-10, so nothing is written", () => {
      const { tree } = adtA01({ controlId: "" });

      expect(() => encode(tree)).toThrow(MllpInvalidMessageError);
      expect(() => encode(tree)).toThrow(
        expect.objectContaining({
          cause: expect.stringContaining("no MSH-10 control ID"),
        })
      );
    });
  });
});

describe("decode()", () => {
  describe("an accept", () => {
    it.each(["AA", "CA"])("reports %s as an accept", (code) => {
      const { text, controlId } = ack(code);

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        response: { code, controlId },
        type: "accept",
      });
    });

    it("carries the acknowledgment as both text and tree", () => {
      const { text, controlId } = ack("AA");

      const reply = decode(encodeBytes(text), controlId);

      expect(reply).toMatchObject({
        response: { raw: text, tree: { type: "root" } },
        type: "accept",
      });
    });

    it("reads MSA-3 as the text", () => {
      const { text, controlId } = ack("AA", { msa3: "Stored" });

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        response: { text: "Stored" },
      });
    });

    it("has no text when MSA-3 is absent", () => {
      const { text, controlId } = ack("AA");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        response: { text: undefined },
      });
    });

    it("does not take ERR-8 as its text", () => {
      // ERR-8 stands in for MSA-3 on a NAK only; an accept has no ERR to read.
      const { text, controlId } = ack("AA");
      const bytes = encodeBytes(
        [text, "ERR|||0^Message accepted^HL70357|I||||Ignore me"].join("\r")
      );

      expect(decode(bytes, controlId)).toMatchObject({
        response: { text: undefined },
      });
    });

    it("keeps the acknowledgment's own id apart from the one it answers", () => {
      // Confusing them is how correlation silently breaks: every reply would
      // be compared against the receiver's own identifier for it.
      const { text, id, controlId } = ack("AA");

      const reply = decode(encodeBytes(text), controlId);

      expect(reply).toMatchObject({ response: { controlId, id } });
      expect(id).not.toBe(controlId);
    });
  });

  describe("a NAK", () => {
    const EXCEPTIONS = [
      ["AE", AckApplicationError],
      ["AR", AckApplicationReject],
      ["CE", AckCommitError],
      ["CR", AckCommitReject],
    ] as const;

    it.each(EXCEPTIONS)("reports %s as a nak", (code, exception) => {
      const { text, controlId } = ack(code);

      const reply = decode(encodeBytes(text), controlId);

      expect(reply.type).toBe("nak");
      expect(reply).toMatchObject({ exception: expect.any(exception) });
    });

    it("is not an MllpClientError: the remote system answered properly", () => {
      // The class is how a caller tells "the remote system said no" from "the
      // client or the wire failed", and only the second closes the connection.
      const { text, controlId } = ack("AE");

      const reply = decode(encodeBytes(text), controlId);

      expect(reply.type).toBe("nak");
      expect(reply).toMatchObject({ exception: expect.any(AckException) });
      expect(reply).not.toMatchObject({
        exception: expect.any(MllpClientError),
      });
    });

    it("carries MSA-2 as the control ID", () => {
      const { text, controlId } = ack("AE");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        exception: { controlId },
      });
    });

    it("carries ERR-3 as the error code and ERR-4 as the severity", () => {
      const { text, controlId } = ack("AE", { msa3: "Required field missing" });
      const bytes = encodeBytes(
        [text, "ERR|||204^Required field missing^HL70357|E|||PID.5"].join("\r")
      );

      expect(decode(bytes, controlId)).toMatchObject({
        exception: {
          errorCode: "204",
          severity: "E",
          text: "Required field missing",
        },
      });
    });

    it("says what the remote system gave, in the message", () => {
      const { text, controlId } = ack("AE", { msa3: "Required field missing" });
      const bytes = encodeBytes(
        [text, "ERR|||204^Required field missing^HL70357|E|||PID.5"].join("\r")
      );

      expect(decode(bytes, controlId)).toMatchObject({
        exception: {
          message: expect.stringContaining(
            "Required field missing; ERR-3 204; ERR-4 E."
          ),
        },
      });
    });

    it("says so when the remote system gave no reason", () => {
      const { text, controlId } = ack("CE");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        exception: { message: expect.stringContaining("It gave no reason.") },
      });
    });

    it("falls back to ERR-8 for the text when MSA-3 is absent", () => {
      const { text, controlId } = ack("AR");
      const bytes = encodeBytes(
        [text, "ERR|||207^Application error^HL70357|E||||Try again later"].join(
          "\r"
        )
      );

      expect(decode(bytes, controlId)).toMatchObject({
        exception: { text: "Try again later" },
      });
    });

    it("prefers MSA-3 over ERR-8 when both are present", () => {
      const { text, controlId } = ack("AR", { msa3: "From MSA-3" });
      const bytes = encodeBytes(
        [text, "ERR|||207^Application error^HL70357|E||||From ERR-8"].join("\r")
      );

      expect(decode(bytes, controlId)).toMatchObject({
        exception: { text: "From MSA-3" },
      });
    });

    it("has no ERR fields when there is no ERR segment", () => {
      const { text, controlId } = ack("CE");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        exception: { errorCode: undefined, severity: undefined },
      });
    });
  });

  describe("a reply that answers another message", () => {
    it("reports an accept naming another message as invalid", () => {
      const { text } = ack("AA", { controlId: "OTHER" });

      expect(decode(encodeBytes(text), "OURS")).toMatchObject({
        error: { cause: expect.stringContaining('MSA-2 is "OTHER"') },
        type: "invalid",
      });
    });

    it("reports a NAK naming another message as invalid, not as a nak", () => {
      // MSA-2 is read before MSA-1: a rejection of someone else's message is
      // not this message's answer.
      const { text } = ack("AE", { controlId: "OTHER" });

      expect(decode(encodeBytes(text), "OURS").type).toBe("invalid");
    });

    it("reports an empty MSA-2 as invalid", () => {
      const { text } = ack("AA", { controlId: "" });

      expect(decode(encodeBytes(text), "OURS").type).toBe("invalid");
    });
  });

  describe("a reply it cannot read", () => {
    it("names the failure as the client's, not the charset's or the parser's", () => {
      // A caller that had to treat every failure as the remote system's fault
      // would close a healthy connection whenever the fault was ours.
      const { text, controlId } = ack("AA");
      const bytes = encodeBytes(text.split("\r")[0] ?? "");

      expect(decode(bytes, controlId)).toMatchObject({
        error: expect.any(MllpInvalidResponseError),
        type: "invalid",
      });
    });

    it("reports an empty MSA-1 as invalid", () => {
      const { text, controlId } = ack("");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        error: { cause: expect.stringContaining("MSA-1 is empty") },
        type: "invalid",
      });
    });

    it("reports an MSA-1 outside Table 0008 as invalid", () => {
      const { text, controlId } = ack("OK");

      expect(decode(encodeBytes(text), controlId)).toMatchObject({
        error: { cause: expect.stringContaining('MSA-1 is "OK"') },
        type: "invalid",
      });
    });

    it("keeps the charset error as the cause when the bytes are not UTF-8", () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0x4d, 0x53, 0x48]);

      expect(decode(bytes, "OURS")).toMatchObject({
        error: { cause: expect.any(CharsetError) },
        type: "invalid",
      });
    });
  });
});
