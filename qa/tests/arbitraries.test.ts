import fc from "fast-check";

import {
  arbHL7v2Message,
  arbHL7v2MessageCustomDelimiters,
} from "../src/arbitraries";
import { normalize } from "../src/fixtures";

// The round-trip and fuzz properties draw from these generators, and read a
// message with the delimiters its MSH declares. A message written with other
// delimiters still round-trips, as one long Segment ID per line, so those
// properties would pass while checking nothing; these two check that each
// generator writes what it declares.
const SEGMENT_ID = /^[A-Z]{3}$/;

describe("HL7v2 message arbitraries", () => {
  // A valid message declares `|^~\&` in its MSH, and every other line is a
  // Segment ID of three letters other than MSH, then the field separator.
  //
  // Mutant: `arbSegment` joins the Segment ID to its fields with the component
  // separator. Fails on `"MSH|^~\\&|||\rAAA^"`.
  it("writes a valid message with the delimiters its MSH declares", () => {
    fc.assert(
      fc.property(arbHL7v2Message, (msg) => {
        const [msh = "", ...segments] = msg.split("\r");

        expect(msh.startsWith("MSH|^~\\&|")).toBe(true);
        for (const segment of segments) {
          const [id = ""] = segment.split("|", 1);
          expect(id).toMatch(SEGMENT_ID);
          expect(id).not.toBe("MSH");
          expect(segment.charAt(3)).toBe("|");
        }
      }),
      { numRuns: 300 }
    );
  });

  // A custom delimiter message declares five distinct characters in MSH-1 and
  // MSH-2, and every other line is a Segment ID of three letters, then the
  // field separator MSH-1 declares.
  //
  // Mutant: `arbSegment` joins the Segment ID to its fields with `|` whatever
  // the delimiters. Fails on `"MSH+&@*!+++\rAAA|"`.
  it("writes a custom delimiter message with the delimiters its MSH declares", () => {
    fc.assert(
      fc.property(arbHL7v2MessageCustomDelimiters, (msg) => {
        const [msh = "", ...segments] = msg.split("\r");
        const field = msh.charAt(3);
        const encodingCharacters = msh.slice(4, 8);

        expect(msh.slice(0, 3)).toBe("MSH");
        expect(new Set([field, ...encodingCharacters]).size).toBe(5);
        expect(msh.charAt(8)).toBe(field);
        for (const segment of segments) {
          expect(segment.slice(0, 3)).toMatch(SEGMENT_ID);
          expect(segment.charAt(3)).toBe(field);
        }
      }),
      { numRuns: 300 }
    );
  });
});

describe("normalize()", () => {
  it("converts LF to CR", () => {
    expect(normalize("MSH|a\nPID|b\n")).toBe("MSH|a\rPID|b\r");
  });

  it("converts CRLF to CR", () => {
    expect(normalize("MSH|a\r\nPID|b\r\n")).toBe("MSH|a\rPID|b\r");
  });

  it("keeps the CR after the last segment", () => {
    expect(normalize("MSH|a\rPID|b\r")).toBe("MSH|a\rPID|b\r");
  });

  it("adds a CR after a last segment without one", () => {
    expect(normalize("MSH|a\rPID|b")).toBe("MSH|a\rPID|b\r");
  });

  it("writes multiple trailing CRs as one", () => {
    expect(normalize("MSH|a\r\r\r")).toBe("MSH|a\r");
  });

  it("handles mixed line endings", () => {
    expect(normalize("MSH|a\r\nPID|b\nPV1|c")).toBe("MSH|a\rPID|b\rPV1|c\r");
  });

  it("returns empty string unchanged", () => {
    expect(normalize("")).toBe("");
  });
});
