import { MllpCodecError } from "@glion/mllp-codec";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { decodeBytes } from "@glion/util-charset";
import { describe, expect, it } from "vitest";

import { encode } from "../../src/codec";
import { adtA01 } from "../fixtures";

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

/** The payload of one MLLP frame, decoded to text. */
function payloadOf(framed: Uint8Array): string {
  return decodeBytes(framed.subarray(1, -2));
}

describe("encode()", () => {
  describe("the frame", () => {
    it("wraps the payload in VT and FS CR", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text);

      const framed = encode(tree);

      expect(framed[0]).toBe(VT);
      expect(framed.at(-2)).toBe(FS);
      expect(framed.at(-1)).toBe(CR);
    });

    it("carries the tree's canonical serialization as the payload", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text);

      const framed = encode(tree);

      expect(payloadOf(framed)).toBe(toHl7v2(tree));
    });

    it("encodes the payload as UTF-8", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(text.replace("John", "Jörg"));

      const framed = encode(tree);

      expect(payloadOf(framed)).toContain("Jörg");
    });
  });

  describe("a message it cannot frame", () => {
    it("lets the framing error through when the message carries a reserved byte", () => {
      const { text } = adtA01();
      const tree = parseHL7v2(
        text.replace("Doe", `Doe${String.fromCodePoint(FS)}`)
      );

      expect(() => encode(tree)).toThrow(MllpCodecError);
    });
  });
});
