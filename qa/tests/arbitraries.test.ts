import fc from "fast-check";

import {
  arbHL7v2Message,
  arbHL7v2MessageCustomDelimiters,
} from "../src/arbitraries";

// The round-trip and fuzz properties draw from these generators, and read a
// message with the delimiters its MSH declares. A message written with other
// delimiters still round-trips, as one long Segment ID per line, so those
// properties would pass while checking nothing; these two check that each
// generator writes what it declares.
const SEGMENT_ID = /^[A-Z]{3}$/;

describe("HL7v2 message arbitraries", () => {
  // A valid message declares `|^~\&` in its MSH, every other segment is a
  // Segment ID of three letters other than MSH, then the field separator, and
  // every segment ends with `\r`, the last one included.
  //
  // Mutant: `arbSegment` joins the Segment ID to its fields with the component
  // separator. Fails on `"MSH|^~\\&|||\rAAA^\r"`.
  //
  // Mutant: `message` joins the segments with `\r`. Fails on `"MSH|^~\\&|||"`.
  it("writes a valid message with the delimiters its MSH declares", () => {
    fc.assert(
      fc.property(arbHL7v2Message, (msg) => {
        const [msh = "", ...segments] = msg.split("\r");

        expect(segments.pop()).toBe("");
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
  // MSH-2, every other segment is a Segment ID of three letters, then the
  // field separator MSH-1 declares, and every segment ends with `\r`, the
  // last one included.
  //
  // Mutant: `arbSegment` joins the Segment ID to its fields with `|` whatever
  // the delimiters. Fails on `"MSH+&@*!+++\rAAA|\r"`.
  it("writes a custom delimiter message with the delimiters its MSH declares", () => {
    fc.assert(
      fc.property(arbHL7v2MessageCustomDelimiters, (msg) => {
        const [msh = "", ...segments] = msg.split("\r");

        expect(segments.pop()).toBe("");
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
