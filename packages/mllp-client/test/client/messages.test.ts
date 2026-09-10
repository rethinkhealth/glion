/**
 * `encode()` and `decode()`: one tree to the frame it is written as,
 * and one received frame to the acknowledgment it carries.
 */

import {
  AckApplicationError,
  AckApplicationReject,
  AckCommitError,
  AckCommitReject,
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
  describe("the bytes", () => {
    it("carries the tree's canonical serialization", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text);

      expect(decodeBytes(encode(tree))).toBe(toHl7v2(tree));
    });

    it("encodes them as UTF-8", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text.replace("John", "Jörg"));

      expect(decodeBytes(encode(tree))).toContain("Jörg");
    });
  });

  describe("the control ID", () => {
    it("throws when the message has no MSH-10, so nothing is written", () => {
      const { text } = adtA01({ controlId: "" });

      expect(() => encode(parseHL7v2(text))).toThrow(MllpInvalidMessageError);
    });
  });
});

describe("decode()", () => {
  describe("an accept", () => {
    it.each(["AA", "CA"])("reads %s", (code) => {
      const { text } = ack(code);
      const bytes = encodeBytes(text);

      expect(decode(bytes)).toMatchObject({ code });
    });

    it("carries the acknowledgment as both text and tree", () => {
      const { text } = ack("AA");
      const bytes = encodeBytes(text);

      const outcome = decode(bytes);

      expect(outcome.raw).toBe(text);
      expect(outcome.tree.type).toBe("root");
    });

    it("reads MSA-3 as the text", () => {
      const { text } = ack("AA", { msa3: "Message accepted" });
      const bytes = encodeBytes(text);

      expect(decode(bytes)).toMatchObject({ text: "Message accepted" });
    });

    it("has no text when MSA-3 is absent", () => {
      const { text } = ack("AA");
      const bytes = encodeBytes(text);

      expect(decode(bytes).text).toBeUndefined();
    });

    it("never carries the ERR fields", () => {
      const { text } = ack("AA");
      const bytes = encodeBytes(
        [text, "ERR|||204^Required field missing^HL70357|E|||PID.5"].join("\r")
      );

      const outcome = decode(bytes);

      expect(outcome).not.toHaveProperty("errorCode");
      expect(outcome).not.toHaveProperty("severity");
    });

    it("does not take ERR-8 as its text", () => {
      // ERR-8 stands in for MSA-3 only on a NAK. An ERR segment beside an
      // accept describes nothing, so the accept has no text.
      const { text } = ack("AA");
      const bytes = encodeBytes(
        [text, "ERR|||207^Application error^HL70357|E||||Try again later"].join(
          "\r"
        )
      );

      expect(decode(bytes).text).toBeUndefined();
    });
  });

  describe("a NAK", () => {
    const EXCEPTIONS = [
      ["AE", AckApplicationError],
      ["AR", AckApplicationReject],
      ["CE", AckCommitError],
      ["CR", AckCommitReject],
    ] as const;

    it.each(EXCEPTIONS)("throws the %s exception", (code, exception) => {
      const { text } = ack(code);
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow(exception);
    });

    it("is not an MllpClientError: the remote system answered properly", () => {
      // The class is how a caller tells "the remote system said no" from "the
      // client or the wire failed", and only the second closes the connection.
      const { text } = ack("AE");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).not.toThrow(MllpClientError);
    });

    it("carries MSA-2 as the control ID", () => {
      const { text, controlId } = ack("AE");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({ controlId })
      );
    });

    it("carries ERR-3 as the error code and ERR-4 as the severity", () => {
      const { text } = ack("AE", { msa3: "Required field missing" });
      const bytes = encodeBytes(
        [text, "ERR|||204^Required field missing^HL70357|E|||PID.5"].join("\r")
      );

      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({
          errorCode: "204",
          severity: "E",
          text: "Required field missing",
        })
      );
    });

    it("says what the remote system gave, in the message", () => {
      const { text } = ack("AE", { msa3: "Required field missing" });
      const bytes = encodeBytes(
        [text, "ERR|||204^Required field missing^HL70357|E|||PID.5"].join("\r")
      );

      expect(() => decode(bytes)).toThrow(
        "Required field missing; ERR-3 204; ERR-4 E."
      );
    });

    it("says so when the remote system gave no reason", () => {
      const { text } = ack("CE");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow("It gave no reason.");
    });

    it("falls back to ERR-8 for the text when MSA-3 is absent", () => {
      const { text } = ack("AR");
      const bytes = encodeBytes(
        [text, "ERR|||207^Application error^HL70357|E||||Try again later"].join(
          "\r"
        )
      );

      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({ text: "Try again later" })
      );
    });

    it("prefers MSA-3 over ERR-8 when both are present", () => {
      const { text } = ack("AR", { msa3: "From MSA-3" });
      const bytes = encodeBytes(
        [text, "ERR|||207^Application error^HL70357|E||||From ERR-8"].join("\r")
      );

      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({ text: "From MSA-3" })
      );
    });

    it("has no ERR fields when there is no ERR segment", () => {
      const { text } = ack("CE");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({ errorCode: undefined, severity: undefined })
      );
    });
  });

  describe("the two control IDs", () => {
    it("reads MSH-10 as the acknowledgment's own id", () => {
      const original_id = "SOME_ID";
      const { text, id } = ack("AA", { id: original_id });
      const bytes = encodeBytes(text);

      expect(decode(bytes).id).toBe(original_id);
      expect(decode(bytes).id).toBe(id);
    });

    it("reads MSA-2 as the id of the message answered", () => {
      const { text, controlId } = ack("AA");
      const bytes = encodeBytes(text);

      expect(decode(bytes).controlId).toBe(controlId);
    });

    it("keeps the two apart", () => {
      // Confusing them is how correlation silently breaks: every reply would
      // be compared against the receiver's own identifier for it.
      const { text, id, controlId } = ack("AA");
      const bytes = encodeBytes(text);

      const outcome = decode(bytes);

      expect(outcome.id).toBe(id);
      expect(outcome.controlId).toBe(controlId);
      expect(outcome.id).not.toBe(outcome.controlId);
    });

    it("reports MSA-2 naming another message, leaving correlation to the caller", () => {
      const { text } = ack("AA", { controlId: "OTHER" });
      const bytes = encodeBytes(text);

      expect(decode(bytes).controlId).toBe("OTHER");
    });

    it("reports an empty MSA-2 rather than refusing the frame", () => {
      // An acknowledgment that names no message is still an acknowledgment.
      const { text } = ack("AA", { controlId: "" });
      const bytes = encodeBytes(text);

      expect(decode(bytes).controlId).toBe("");
    });
  });

  describe("a frame it cannot read", () => {
    it("names the failure as the client's, not the charset's or the parser's", () => {
      // A caller that had to treat every throw as the remote system's fault
      // would close a healthy connection whenever the fault was ours.
      const { text } = ack("AA");
      const bytes = encodeBytes(text.split("\r")[0] ?? "");

      expect(() => decode(bytes)).toThrow(MllpInvalidResponseError);
    });

    it("throws when MSA-1 is empty", () => {
      const { text } = ack("");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow("MSA-1 is empty");
    });

    it("throws when there is no MSA segment at all", () => {
      const { text } = ack("AA");
      const bytes = encodeBytes(text.split("\r")[0] ?? "");

      expect(() => decode(bytes)).toThrow("MSA-1 is empty");
    });

    it("throws when MSA-1 is not one of the six acknowledgment codes", () => {
      const { text } = ack("OK");
      const bytes = encodeBytes(text);

      expect(() => decode(bytes)).toThrow('MSA-1 is "OK"');
    });

    it("lets the charset error through when the bytes are not UTF-8", () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0x4d, 0x53, 0x48]);

      expect(() => decode(bytes)).toThrow(MllpInvalidResponseError);
      expect(() => decode(bytes)).toThrow(
        expect.objectContaining({ cause: expect.any(CharsetError) })
      );
    });
  });
});
