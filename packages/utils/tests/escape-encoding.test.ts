import type { Delimiters } from "@glion/ast";
import fc from "fast-check";

import { DEFAULT_DELIMITERS } from "../src/constants";
import { EscapeSequenceError } from "../src/errors";
import { decodeEscapes } from "../src/escape-decoding";
import { encodeEscapes, escapeText } from "../src/escape-encoding";

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

// Every escape code that writes the character `ch`: its named code, when
// `ch` is a separator or the escape character, and its hexadecimal escape
// with each digit `A`–`F` in either case. An encoder may refuse `ch` only when
// every one of them holds a delimiter.
const escapeCodesFor = (ch: string, d: Delimiters): string[] => {
  const named = [
    [d.field, "F"],
    [d.component, "S"],
    [d.repetition, "R"],
    [d.subcomponent, "T"],
    [d.escape, "E"],
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

// Whether `text` holds a delimiter of `d`, the escape character, or a
// character below U+0020.
const holdsSyntax = (text: string, d: Delimiters): boolean =>
  [...text].some(
    (ch) =>
      [d.field, d.component, d.repetition, d.subcomponent, d.escape].includes(
        ch
      ) || ch < " "
  );

// Escape codes a sender writes: the ones the table decodes, and ones that
// stay in the value as written, such as `\E\`, `\.br\`, and `\X41\`.
const WIRE_CODES = [
  "F",
  "S",
  "R",
  "T",
  "E",
  "P",
  "H",
  "N",
  ".br",
  ".sp 2",
  "Zsite",
  "C2842",
  "Q",
  "",
  "X41",
  "XC3A9",
  "X7C",
  "X0D",
  "X0d",
  "X0A",
  "X09",
  "X0D0A",
];

// A value as a sender writes it on the wire with the delimiter set `d`: plain
// characters, none a delimiter, the escape character, or a control
// character, and escape sequences from WIRE_CODES that hold no delimiter.
const arbWire = (d: Delimiters): fc.Arbitrary<string> => {
  const sequences = WIRE_CODES.filter((code) => !holdsSyntax(code, d)).map(
    (code) => `${d.escape}${code}${d.escape}`
  );
  return fc.string({
    unit: fc.oneof(
      fc
        .string({ maxLength: 1, minLength: 1, unit: "grapheme" })
        .filter((ch) => !holdsSyntax(ch, d)),
      fc.constantFrom(...sequences)
    ),
  });
};

describe(encodeEscapes, () => {
  it("encodes every separator, an escape character without a closing one, and a carriage return", () => {
    expect(encodeEscapes("a|b^c~d&e\\f\rg", DEFAULT_DELIMITERS)).toBe(
      "a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f\\X0D\\g"
    );
  });

  it("encodes custom delimiters", () => {
    expect(encodeEscapes("a*b$c%d@e#f\rg", CUSTOM_DELIMITERS)).toBe(
      "a#F#b#S#c#R#d#T#e#E#f#X0D#g"
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
      "a\\E\\Zfoo\\F\\bar\\E\\b\\E\\Zx\\S\\y\\R\\z\\T\\w\\E\\c\\E\\Zq\\X0D\\r\\E\\d"
    );
  });

  it("encodes a control character inside a locally defined sequence", () => {
    expect(encodeEscapes("a\\Zfoo\nbar\\b", DEFAULT_DELIMITERS)).toBe(
      "a\\E\\Zfoo\\X0A\\bar\\E\\b"
    );
  });

  it("writes a sequence as it is whatever its code, since every escape character in a value starts one", () => {
    expect(
      encodeEscapes(
        "\\h\\a\\Q\\b\\.BR\\c\\P\\d\\E\\e\\X41\\f\\.br\\g",
        DEFAULT_DELIMITERS
      )
    ).toBe("\\h\\a\\Q\\b\\.BR\\c\\P\\d\\E\\e\\X41\\f\\.br\\g");
  });

  it("writes the escape of a separator in a value as it is, as the separator it stands for", () => {
    const wire = encodeEscapes("a\\F\\b", DEFAULT_DELIMITERS);

    expect(wire).toBe("a\\F\\b");
    expect(decodeEscapes(wire, DEFAULT_DELIMITERS)).toBe("a|b");
  });

  it("writes a character set switch with the escape character MSH-2 declares", () => {
    expect(encodeEscapes("#C2842#a*b#M2442#c", CUSTOM_DELIMITERS)).toBe(
      "#C2842#a#F#b#M2442#c"
    );
  });

  it("encodes both escape characters of a pair whose text holds a separator, and one without a closing one", () => {
    expect(encodeEscapes("a\\Q\\b\\.sp|2\\c\\", DEFAULT_DELIMITERS)).toBe(
      "a\\Q\\b\\E\\.sp\\F\\2\\E\\c\\E\\"
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

  it("writes a carriage return and a line feed as hex escapes with any delimiters", () => {
    expect(encodeEscapes("a\rb\nc", { ...CUSTOM_DELIMITERS, field: "." })).toBe(
      "a#X0D#b#X0A#c"
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
    expect(decodeEscapes(wire, d)).toBe("\\E\\H\\E\\");
  });

  // HL7v2 §2.7.1: a sender escapes every delimiter in a value. A value read
  // from the wire and written again is the value that arrived: each code of
  // the table is read as its character and written as that code, and every
  // other escape sequence stays as written. Reading it a second time changes
  // nothing. The domain is every value a sender writes with any five
  // delimiters, in which each escape character has a closing one.
  //
  // Mutant: `tableCharacter` drops its `escapeCode(ch, d) === code` check.
  // Fails on `\X7C\`, read as `|` and written as `\F\`.
  it("writes a value read from the wire back as it was read", () => {
    fc.assert(
      fc.property(
        arbDelimiters(
          fc.oneof(
            fc.constantFrom(...PUNCTUATION),
            fc.constantFrom(...ESCAPE_CODE_CHARACTERS)
          )
        ).chain((d) => fc.tuple(fc.constant(d), arbWire(d))),
        ([d, wire]) => {
          const value = decodeEscapes(wire, d);

          expect(decodeEscapes(value, d)).toBe(value);
          expect(encodeEscapes(value, d)).toBe(wire);
        }
      ),
      {
        examples: [
          [
            [
              DEFAULT_DELIMITERS,
              "a\\X7C\\b\\F\\c\\E\\d\\.br\\e\\X0D\\f\\X0D0A\\g\\E\\F\\E\\",
            ],
          ],
        ],
      }
    );
  });

  // Any value is written with no separator, no control character, and no
  // escape character outside a closed sequence, so the parser splits the
  // message where its delimiters are. The written value is written the same
  // way again, and read and written back unchanged. With delimiters that are
  // letters or digits, a value may hold a character that no escape code
  // writes; EscapeSequenceError names it, and that outcome is correct.
  //
  // Mutant: `holdsTableCharacter` returns `false`. Fails on `\|\`, written
  // with a raw `|`.
  it("writes any value as a value the parser splits correctly, or throws EscapeSequenceError for a character none can write", () => {
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
          expect(encodeEscapes(wire, d)).toBe(wire);
          expect(encodeEscapes(decodeEscapes(wire, d), d)).toBe(wire);
        }
      ),
      {
        examples: [
          [[DEFAULT_DELIMITERS, "\\|\\"]],
          [[{ ...DEFAULT_DELIMITERS, component: "E", repetition: "C" }, "\\"]],
        ],
      }
    );
  });

  // Free text held through escapeText is written and read back as the same
  // value, with delimiters that are not letters or digits.
  //
  // Mutant: the table names the subcomponent separator `S` instead of `T`.
  // Fails on `&`, read back as `^`.
  it("reads back any free text held through escapeText", () => {
    fc.assert(
      fc.property(
        arbDelimiters(fc.constantFrom(...PUNCTUATION)).chain((d) =>
          fc.tuple(fc.constant(d), arbValue(d))
        ),
        ([d, text]) => {
          const value = escapeText(text, d);

          expect(decodeEscapes(encodeEscapes(value, d), d)).toBe(value);
        }
      ),
      { examples: [[[DEFAULT_DELIMITERS, "&"]]] }
    );
  });
});

describe(escapeText, () => {
  it("writes each escape character as `\\E\\`", () => {
    expect(escapeText("C:\\temp\\H\\file", DEFAULT_DELIMITERS)).toBe(
      "C:\\E\\temp\\E\\H\\E\\file"
    );
  });

  it("leaves text without the escape character as it is", () => {
    expect(escapeText("a|b", DEFAULT_DELIMITERS)).toBe("a|b");
  });

  it("writes the escape character as a hex escape when `E` is a delimiter", () => {
    expect(
      escapeText("a<b", { ...CUSTOM_DELIMITERS, component: "E", escape: "<" })
    ).toBe("a<X3C<b");
  });

  it("is written as data, not as a sequence", () => {
    const value = escapeText("C:\\temp\\H\\file", DEFAULT_DELIMITERS);

    expect(encodeEscapes(value, DEFAULT_DELIMITERS)).toBe(
      "C:\\E\\temp\\E\\H\\E\\file"
    );
  });
});
