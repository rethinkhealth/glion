/**
 * QR4: Data Fidelity — Round-trip parse-serialize invariant.
 *
 * Proves that for valid HL7v2 messages, parse(S) → serialize → S' yields
 * S' === S. This is the strongest proof that no data is lost, reordered,
 * or corrupted during the parse-transform-serialize lifecycle.
 *
 * Uses fixed fixtures and fuzz-driven verification with the same arbitraries
 * from the crash resilience suite (QR3).
 */
import { hl7v2AnnotateDelimiters } from "@glion/annotate-delimiters";
import { f as field, m as message, s as segment } from "@glion/builder";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2, toHl7v2 } from "@glion/to-hl7v2";
import { value } from "@glion/util-query";
import { EscapeSequenceError } from "@glion/utils";
import fc from "fast-check";
import { unified } from "unified";

import {
  arbAdversarialInput,
  arbHL7v2Message,
  arbHL7v2MessageCustomDelimiters,
  arbMutatedCustomDelimiterMessage,
  arbMutatedMessage,
} from "../src/arbitraries";
import { discoverFixtures, normalize, readFixture } from "../src/fixtures";

/**
 * Minimal pipeline for round-trip testing: parse → annotate delimiters →
 * serialize. No lint or decode plugins — we want to test data preservation, not
 * transformation.
 */
const roundTripProcessor = unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateDelimiters)
  .use(hl7v2ToHl7v2)
  .freeze();

// ---------------------------------------------------------------------------
// Fixed fixture round-trip tests
// ---------------------------------------------------------------------------

const fixtures = discoverFixtures(
  (f) => !f.startsWith("invalid-") && !f.startsWith("edge-")
);

describe("QR4: round-trip data fidelity", () => {
  it("discovers at least 5 round-trip fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
  });

  describe("fixed fixtures", () => {
    it.each(fixtures)(
      "%s — round-trips through parse → serialize",
      async (filename) => {
        const source = readFixture(filename);

        const result = await roundTripProcessor.process(source);
        const serialized = String(result);

        expect(normalize(serialized)).toBe(normalize(source));
      }
    );
  });

  describe("edge cases", () => {
    it("CRLF line endings round-trip after normalization", async () => {
      const source = readFixture("edge-crlf-line-endings.hl7");
      const result = await roundTripProcessor.process(source);

      expect(normalize(String(result))).toBe(normalize(source));
    });

    it("custom delimiters round-trip correctly", async () => {
      const source = readFixture("edge-custom-delimiters.hl7");
      const result = await roundTripProcessor.process(source);

      expect(normalize(String(result))).toBe(normalize(source));
    });

    it("escaped delimiters round-trip correctly", async () => {
      const source = readFixture("edge-escaped-delimiters.hl7");
      const result = await roundTripProcessor.process(source);

      expect(normalize(String(result))).toBe(normalize(source));
    });

    it("trailing empty fields round-trip as written", async () => {
      const source = readFixture("edge-empty-segments.hl7");
      const result = await roundTripProcessor.process(source);

      expect(normalize(String(result))).toBe(normalize(source));
    });
  });

  // ---------------------------------------------------------------------------
  // Fuzz-driven round-trip tests
  // ---------------------------------------------------------------------------

  describe("fuzz: valid messages", () => {
    it("round-trips exactly", async () => {
      await fc.assert(
        fc.asyncProperty(arbHL7v2Message, async (msg) => {
          const serialized = String(await roundTripProcessor.process(msg));

          expect(normalize(serialized)).toBe(normalize(msg));
        }),
        { numRuns: 300 }
      );
    });
  });

  describe("fuzz: Segment IDs", () => {
    it("a Segment ID that holds the escape character round-trips as written", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({
            minLength: 1,
            unit: fc.constantFrom(
              "\\",
              "\\F\\",
              "\\S\\",
              "\\R\\",
              "\\T\\",
              "\\E\\",
              "\\X7C\\",
              "\\.br\\",
              "Z",
              "1"
            ),
          }),
          async (segmentId) => {
            const source = `MSH|^~\\&|a\r${segmentId}|b`;
            const serialized = String(await roundTripProcessor.process(source));

            expect(normalize(serialized)).toBe(source);
          }
        ),
        { numRuns: 300 }
      );
    });
  });

  describe("fuzz: custom delimiter messages", () => {
    it("round-trips exactly", async () => {
      await fc.assert(
        fc.asyncProperty(arbHL7v2MessageCustomDelimiters, async (msg) => {
          const serialized = String(await roundTripProcessor.process(msg));

          expect(normalize(serialized)).toBe(normalize(msg));
        }),
        { numRuns: 300 }
      );
    });
  });

  describe("fuzz: mutated custom delimiter messages", () => {
    it("any parseable mutated input stabilizes after one round-trip", async () => {
      let skipCount = 0;

      await fc.assert(
        fc.asyncProperty(arbMutatedCustomDelimiterMessage, async (msg) => {
          let firstPass: string;
          try {
            firstPass = String(await roundTripProcessor.process(msg));
          } catch {
            skipCount++;
            return;
          }

          let secondPass: string;
          try {
            secondPass = String(await roundTripProcessor.process(firstPass));
          } catch {
            skipCount++;
            return;
          }

          expect(normalize(secondPass)).toBe(normalize(firstPass));
        }),
        { numRuns: 300 }
      );

      expect(skipCount).toBeLessThan(150);
    });
  });

  describe("fuzz: mutated messages", () => {
    it("any parseable mutated input stabilizes after one round-trip", async () => {
      let skipCount = 0;

      await fc.assert(
        fc.asyncProperty(arbMutatedMessage, async (msg) => {
          let firstPass: string;
          try {
            firstPass = String(await roundTripProcessor.process(msg));
          } catch {
            skipCount++;
            return;
          }

          const secondPass = String(
            await roundTripProcessor.process(firstPass)
          );
          expect(normalize(secondPass)).toBe(normalize(firstPass));
        }),
        { numRuns: 300 }
      );

      // Ensure we actually tested a meaningful number of inputs
      expect(skipCount).toBeLessThan(150);
    });
  });

  describe("fuzz: adversarial inputs", () => {
    it("any parseable adversarial input stabilizes after one round-trip", async () => {
      let skipCount = 0;

      await fc.assert(
        fc.asyncProperty(arbAdversarialInput, async (msg) => {
          let firstPass: string;
          try {
            firstPass = String(await roundTripProcessor.process(msg));
          } catch {
            skipCount++;
            return;
          }

          let secondPass: string;
          try {
            secondPass = String(await roundTripProcessor.process(firstPass));
          } catch {
            skipCount++;
            return;
          }

          expect(normalize(secondPass)).toBe(normalize(firstPass));
        }),
        { numRuns: 300 }
      );

      expect(skipCount).toBeLessThan(150);
    });
  });
});

describe("QR4: content round-trips through serialize and parse", () => {
  // Every character an escape sequence in a value can hold. A delimiter drawn
  // from this list collides with a sequence the serializer writes or keeps:
  //
  //   E F R S T       the named codes `\E\ \F\ \R\ \S\ \T\`
  //   . b r           the segment delimiter's code `\.br\`
  //   X               the prefix of every hexadecimal escape `\Xdd\`
  //   0-9 A-F a-f     hexadecimal digits, in both cases, since the serializer
  //                   writes a digit in lowercase when its uppercase form
  //                   collides
  //   H N Z C M       sequences kept as written, such as `\H\` and `\Zsite\`,
  //                   which must be escaped instead when they hold a delimiter
  //
  // Every other character is still drawn through `fc.char()` below, just not
  // favoured.
  const ESCAPE_CODE_CHARACTERS = [..."EFRST.brX0123456789ABCDEFabcdefHNZCM"];
  const read = (source: string): string => {
    const tree = unified().use(hl7v2Parser).parse(source);
    return value(tree, "PID.3")?.value ?? "";
  };
  const write = (content: string): string =>
    toHl7v2(
      message(
        segment("MSH", field("|"), field("^~\\&")),
        segment("PID", field("1"), field(""), field(content))
      )
    );

  it("keeps a locally defined sequence that holds a delimiter as content", () => {
    const content = "a\\Zfoo|bar\\b";
    const wire = write(content);

    expect(wire).toBe("MSH|^~\\&\rPID|1||a\\E\\Zfoo\\F\\bar\\E\\b");
    expect(read(wire)).toBe(content);
  });

  it("keeps a locally defined sequence and a character set switch as they are", () => {
    const content = "\\Zsite 7\\a\\C2842\\b\\M2442\\c";

    expect(write(content)).toBe(`MSH|^~\\&\rPID|1||${content}`);
    expect(read(write(content))).toBe(content);
  });

  it("reads back any content a value was given", () => {
    fc.assert(
      fc.property(fc.string({ unit: "grapheme" }), (content) => {
        expect(read(write(content))).toBe(content);
      })
    );
  });

  it("reads back any content a value was given, with any delimiters", () => {
    fc.assert(
      fc.property(
        // Five distinct delimiters, in MSH order: field separator, then the
        // component, repetition, escape, and subcomponent characters of MSH-2.
        // Each is drawn half the time from ESCAPE_CODE_CHARACTERS and half the
        // time from any printable ASCII character. Drawn uniformly, a delimiter
        // that collides with an escape code is too rare for a run of this
        // property to find.
        fc
          .uniqueArray(
            fc.oneof(fc.constantFrom(...ESCAPE_CODE_CHARACTERS), fc.char()),
            { maxLength: 5, minLength: 5 }
          )
          // The content is then built for those delimiters, one unit at a
          // time from a delimiter, the segment delimiter, a sequence kept as
          // written (with `delimiters[3]`, the escape character), or any
          // grapheme, so that most values hold characters the serializer must
          // escape.
          .chain((delimiters) =>
            fc.tuple(
              fc.constant(delimiters),
              fc.string({
                unit: fc.oneof(
                  fc.constantFrom(...delimiters, "\r"),
                  fc.constantFrom(
                    `${delimiters[3]}H${delimiters[3]}`,
                    `${delimiters[3]}Zsite${delimiters[3]}`
                  ),
                  fc.string({ maxLength: 1, minLength: 1, unit: "grapheme" })
                ),
              })
            )
          ),
        ([[fieldSeparator, ...encodingCharacters], content]) => {
          // Write a message whose MSH declares the drawn delimiters and whose
          // MSH-3 holds the content. A character of the content that no escape
          // sequence can write with these delimiters is refused with
          // EscapeSequenceError, and any other error fails the property.
          let wire: string;
          try {
            wire = toHl7v2(
              message(
                segment(
                  "MSH",
                  field(fieldSeparator as string),
                  field(encodingCharacters.join("")),
                  field(content)
                )
              )
            );
          } catch (error) {
            expect(error).toBeInstanceOf(EscapeSequenceError);
            expect(content).toContain((error as EscapeSequenceError).character);
            return;
          }
          // Read the message back with the parser. MSH-3 must hold the same
          // content: the serializer wrote nothing the parser splits or decodes
          // differently.
          const tree = unified().use(hl7v2Parser).parse(wire);

          expect(value(tree, "MSH.3")?.value ?? "").toBe(content);
        }
      )
    );
  });
});
