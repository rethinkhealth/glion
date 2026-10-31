import type { Delimiters } from "@glion/ast";
import fc from "fast-check";

import { DEFAULT_DELIMITERS } from "../src/constants";
import { EscapeSequenceError } from "../src/errors";
import { decodeEscapes } from "../src/escape-decoding";
import { encodeEscapes } from "../src/escape-encoding";

const CUSTOM_DELIMITERS: Delimiters = {
  component: "$",
  escape: "#",
  field: "*",
  repetition: "%",
  subcomponent: "@",
};

// The round-trip properties at the end of this file are built from four
// helpers. Each property first draws a delimiter set with `arbDelimiters`,
// then chains into `arbValue` to draw a value for that set, and encodes it.
// A written value is checked with `heldDelimiters` and `decodeEscapes`; a
// refused one with `escapeCodesFor`.

// Characters that are not letters or digits. `.` collides with `\.br\`, but no
// hexadecimal escape holds one of them, so a delimiter set drawn from them can
// write every value.
const PUNCTUATION = [..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"];
// The characters escape sequences are written with: the named codes (`E`,
// `F`, `R`, `S`, `T`, `.br`), the hexadecimal escape (`X`, hexadecimal digits
// in both cases), and the sequences kept as written (`H`, `N`, `Z`, `C`, `M`).
// Mixing them into the draw makes a delimiter that collides with an escape
// sequence common instead of a rare accident.
const ESCAPE_CODE_CHARACTERS = [..."EFRST.brX0123456789ABCDEFabcdefHNZCM"];

// A delimiter set: five distinct characters from `arbCharacter`, assigned to
// the field, component, repetition, escape, and subcomponent roles.
const arbDelimiters = (
  arbCharacter: fc.Arbitrary<string>
): fc.Arbitrary<Delimiters> =>
  fc
    .uniqueArray(arbCharacter, { maxLength: 5, minLength: 5 })
    .map(([field, component, repetition, escape, subcomponent]) => ({
      component: component as string,
      escape: escape as string,
      field: field as string,
      repetition: repetition as string,
      subcomponent: subcomponent as string,
    }));

// A value for the delimiter set `d`, built one unit at a time from a delimiter
// of `d`, a line break, a sequence kept as written, or any grapheme, so that
// most values hold characters the encoder must write as escape sequences.
const arbValue = (d: Delimiters): fc.Arbitrary<string> =>
  fc.string({
    unit: fc.oneof(
      fc.constantFrom(
        d.field,
        d.component,
        d.repetition,
        d.escape,
        d.subcomponent,
        "\r",
        "\n"
      ),
      fc.constantFrom(
        `${d.escape}H${d.escape}`,
        `${d.escape}.sp 2${d.escape}`,
        `${d.escape}Zsite${d.escape}`,
        `${d.escape}C2842${d.escape}`
      ),
      fc.string({ maxLength: 1, minLength: 1, unit: "grapheme" })
    ),
  });

// The delimiters of `d`, and the segment terminators, that appear in the
// encoded value `wire`. An encoded value must hold none: the parser splits at
// a delimiter or a segment terminator before it decodes escape sequences, so
// one inside `wire` would split the value.
const heldDelimiters = (wire: string, d: Delimiters): string[] =>
  [d.field, d.component, d.repetition, d.subcomponent, "\r", "\n"].filter(
    (delimiter) => wire.includes(delimiter)
  );

// Every escape code `decodeEscapes` reads back as the ASCII character `ch`:
// its named code, when `ch` is a delimiter or the escape character, and its
// hexadecimal escape with each digit `A`–`F` in either case. An encoder may
// refuse `ch` only when every one of them holds a delimiter.
const escapeCodesFor = (ch: string, d: Delimiters): string[] => {
  const named = [
    [d.field, "F"],
    [d.component, "S"],
    [d.repetition, "R"],
    [d.subcomponent, "T"],
    [d.escape, "E"],
    ["\r", ".br"],
  ]
    .filter(([delimiter]) => delimiter === ch)
    .map(([, code]) => code as string);
  const digits = (ch.codePointAt(0) ?? 0)
    .toString(16)
    .toUpperCase()
    .padStart(2, "0");
  let hex = ["X"];
  for (const digit of digits) {
    const cases = [...new Set([digit, digit.toLowerCase()])];
    hex = hex.flatMap((code) => cases.map((form) => code + form));
  }
  return [...named, ...hex];
};

describe(encodeEscapes, () => {
  it("encodes every delimiter and the escape character", () => {
    expect(encodeEscapes("a|b^c~d&e\\f\rg", DEFAULT_DELIMITERS)).toBe(
      "a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f\\.br\\g"
    );
  });

  it("encodes custom delimiters", () => {
    expect(encodeEscapes("a*b$c%d@e#f\rg", CUSTOM_DELIMITERS)).toBe(
      "a#F#b#S#c#R#d#T#e#E#f#.br#g"
    );
  });

  it("encodes a control character as a hex escape", () => {
    expect(encodeEscapes("line\nfeed\ttab", DEFAULT_DELIMITERS)).toBe(
      "line\\X0A\\feed\\X09\\tab"
    );
  });

  it("writes a formatting command as it is", () => {
    expect(
      encodeEscapes("\\H\\a|b\\N\\ \\.sp 2\\c\\.in+4\\d", DEFAULT_DELIMITERS)
    ).toBe("\\H\\a\\F\\b\\N\\ \\.sp 2\\c\\.in+4\\d");
  });

  it("writes a locally defined sequence as it is", () => {
    expect(encodeEscapes("a\\Zsite 7\\b|\\Z\\c", DEFAULT_DELIMITERS)).toBe(
      "a\\Zsite 7\\b\\F\\\\Z\\c"
    );
  });

  it("writes a character set switch as it is", () => {
    expect(
      encodeEscapes("\\C2842\\a|b\\M2442\\c\\M242844\\d", DEFAULT_DELIMITERS)
    ).toBe("\\C2842\\a\\F\\b\\M2442\\c\\M242844\\d");
  });

  it("encodes a delimiter inside a locally defined sequence", () => {
    expect(
      encodeEscapes("a\\Zfoo|bar\\b\\Zx^y~z&w\\c\\Zq\rr\\d", DEFAULT_DELIMITERS)
    ).toBe(
      "a\\E\\Zfoo\\F\\bar\\E\\b\\E\\Zx\\S\\y\\R\\z\\T\\w\\E\\c\\E\\Zq\\.br\\r\\E\\d"
    );
  });

  it("encodes a control character inside a locally defined sequence", () => {
    expect(encodeEscapes("a\\Zfoo\nbar\\b", DEFAULT_DELIMITERS)).toBe(
      "a\\E\\Zfoo\\X0A\\bar\\E\\b"
    );
  });

  it("encodes a sequence whose case is not the one HL7v2 defines", () => {
    expect(
      encodeEscapes("\\h\\a\\n\\b\\.BR\\c\\z1\\d\\c2842\\e", DEFAULT_DELIMITERS)
    ).toBe(
      "\\E\\h\\E\\a\\E\\n\\E\\b\\E\\.BR\\E\\c\\E\\z1\\E\\d\\E\\c2842\\E\\e"
    );
  });

  it("encodes a literal .br so it reads back as text", () => {
    expect(encodeEscapes("a\\.br\\b", DEFAULT_DELIMITERS)).toBe(
      "a\\E\\.br\\E\\b"
    );
    expect(
      decodeEscapes(
        encodeEscapes("a\\.br\\b", DEFAULT_DELIMITERS),
        DEFAULT_DELIMITERS
      )
    ).toBe("a\\.br\\b");
  });

  it("writes a character set switch with the escape character MSH-2 declares", () => {
    expect(encodeEscapes("#C2842#a*b#M2442#c", CUSTOM_DELIMITERS)).toBe(
      "#C2842#a#F#b#M2442#c"
    );
  });

  it("encodes a character set switch whose content is not hexadecimal pairs", () => {
    expect(
      encodeEscapes(
        "a\\C284\\b\\C28G2\\c\\M24\\d\\M2442843\\e",
        DEFAULT_DELIMITERS
      )
    ).toBe("a\\E\\C284\\E\\b\\E\\C28G2\\E\\c\\E\\M24\\E\\d\\E\\M2442843\\E\\e");
  });

  it("encodes an escape character that does not start a sequence written as it is", () => {
    expect(encodeEscapes("a\\Q\\b\\.sp|2\\c\\", DEFAULT_DELIMITERS)).toBe(
      "a\\E\\Q\\E\\b\\E\\.sp\\F\\2\\E\\c\\E\\"
    );
  });

  it("returns a value without special characters as it is", () => {
    expect(encodeEscapes("PlainValue123", DEFAULT_DELIMITERS)).toBe(
      "PlainValue123"
    );
  });

  it("returns an empty value as it is", () => {
    expect(encodeEscapes("", DEFAULT_DELIMITERS)).toBe("");
  });

  it("writes a character whose escape code is a delimiter as a hex escape", () => {
    expect(encodeEscapes("a#b", { ...CUSTOM_DELIMITERS, component: "E" })).toBe(
      "a#X23#b"
    );
  });

  it("writes the escape character as a hex escape when it is E", () => {
    expect(encodeEscapes("aEb", { ...CUSTOM_DELIMITERS, escape: "E" })).toBe(
      "aEX45Eb"
    );
  });

  it("writes a hex escape with lowercase digits when an uppercase digit is a delimiter", () => {
    expect(
      encodeEscapes("a~b", { ...CUSTOM_DELIMITERS, escape: "~", field: "E" })
    ).toBe("a~X7e~b");
  });

  it("writes the segment terminator as a hex escape when a delimiter is in .br", () => {
    expect(encodeEscapes("a\rb", { ...CUSTOM_DELIMITERS, field: "." })).toBe(
      "a#X0D#b"
    );
  });

  it("throws for a character no escape sequence can write", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "S", field: "X" };
    const thrown = (): unknown => {
      try {
        encodeEscapes("aSb", d);
      } catch (error) {
        return error;
      }
      return undefined;
    };

    const error = thrown();

    expect(error).toBeInstanceOf(EscapeSequenceError);
    expect((error as EscapeSequenceError).character).toBe("S");
    expect((error as EscapeSequenceError).delimiters).toBe(d);
    expect((error as EscapeSequenceError).message).toBe(
      "The value holds a character that must be written as an escape sequence, and every escape sequence for it holds one of the message's delimiters. With delimiters that are ASCII punctuation, every character can be written."
    );
  });

  it("writes a hex digit in lowercase only where its uppercase form is a delimiter", () => {
    const d: Delimiters = {
      component: "é",
      escape: "\\",
      field: "S",
      repetition: "C",
      subcomponent: "a",
    };
    const wire = encodeEscapes("é", d);

    expect(wire).toBe("\\Xc3A9\\");
    expect(decodeEscapes(wire, d)).toBe("é");
  });

  it("throws for a lone surrogate it must escape", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "E", escape: "\uD83D" };

    expect(() => encodeEscapes("a\uD83Db", d)).toThrow(EscapeSequenceError);
  });

  it("escapes a formatting command whose code is a delimiter", () => {
    const d = { ...DEFAULT_DELIMITERS, component: "H" };
    const wire = encodeEscapes("\\H\\", d);

    expect(wire).toBe("\\E\\\\S\\\\E\\");
    expect(decodeEscapes(wire, d)).toBe("\\H\\");
  });

  // With delimiters that are not letters or digits, every value is written,
  // holds no delimiter, and decodes to itself.
  //
  // Mutant: `namedEscapeCode` names the subcomponent delimiter `S` instead of
  // `T`. Fails on `&` with `|^~\&`.
  it("writes any value with delimiters that are not letters or digits", () => {
    fc.assert(
      fc.property(
        arbDelimiters(fc.constantFrom(...PUNCTUATION)).chain((d) =>
          fc.tuple(fc.constant(d), arbValue(d))
        ),
        ([d, value]) => {
          const wire = encodeEscapes(value, d);

          expect(heldDelimiters(wire, d)).toEqual([]);
          expect(decodeEscapes(wire, d)).toBe(value);
        }
      ),
      { examples: [[[DEFAULT_DELIMITERS, "&"]]] }
    );
  });

  // With any delimiters, a value is written as above, or refused with
  // EscapeSequenceError naming a character of the value that every escape code
  // for it would write with a delimiter.
  //
  // Mutant: `hexEscapeCode` keeps a digit `A`–`F` in uppercase when it is a
  // delimiter. Fails on the escape character `\` with `E` and `C` as
  // delimiters, which only `\X5c\` writes.
  it("writes any value with any delimiters, or throws EscapeSequenceError for a character none can write", () => {
    fc.assert(
      fc.property(
        arbDelimiters(
          fc.oneof(fc.constantFrom(...ESCAPE_CODE_CHARACTERS), fc.char())
        ).chain((d) => fc.tuple(fc.constant(d), arbValue(d))),
        ([d, value]) => {
          let wire: string;
          try {
            wire = encodeEscapes(value, d);
          } catch (error) {
            expect(error).toBeInstanceOf(EscapeSequenceError);
            const { character } = error as EscapeSequenceError;
            expect(value).toContain(character);
            expect(
              escapeCodesFor(character, d).filter(
                (code) =>
                  heldDelimiters(code, d).length === 0 &&
                  !code.includes(d.escape)
              )
            ).toEqual([]);
            return;
          }

          expect(heldDelimiters(wire, d)).toEqual([]);
          expect(decodeEscapes(wire, d)).toBe(value);
        }
      ),
      {
        examples: [
          [[{ ...DEFAULT_DELIMITERS, component: "E", repetition: "C" }, "\\"]],
        ],
      }
    );
  });
});
