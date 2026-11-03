import type { Delimiters } from "@glion/ast";
import fc from "fast-check";

import { DEFAULT_DELIMITERS } from "../src/constants";
import { EscapeSequenceError } from "../src/errors";
import { escapes } from "../src/escapes";

const CUSTOM_DELIMITERS: Delimiters = {
  component: "$",
  escape: "#",
  field: "*",
  repetition: "%",
  subcomponent: "@",
};

// The round-trip properties at the end of this file draw a delimiter set
// with `arbDelimiters`, then a value for it: `arbWire` for text as a sender
// writes it, or `arbValue` for any value. A written value is checked with
// `heldDelimiters`, `separatorsAndControls`, and `escapes.read`; a refused one
// with `expectRefused`.

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

// A refusal is correct only for a character of the value that every escape
// code holds a delimiter of.
const expectRefused = (error: unknown, value: string, d: Delimiters): void => {
  expect(error).toBeInstanceOf(EscapeSequenceError);
  const { character } = error as EscapeSequenceError;
  expect(value).toContain(character);
  expect(
    escapeCodesFor(character, d).filter(
      (code) => heldDelimiters(code, d).length === 0 && !code.includes(d.escape)
    )
  ).toEqual([]);
};

// The separators of `d` and the characters below U+0020 in `text`, in order.
const separatorsAndControls = (text: string, d: Delimiters): string[] =>
  [...text].filter(
    (ch) =>
      [d.field, d.component, d.repetition, d.subcomponent].includes(ch) ||
      (ch < " " && ch !== d.escape)
  );

// Whether `part` is `whole` with some items left out.
const isSubsequence = (part: string[], whole: string[]): boolean => {
  let at = 0;
  for (const item of whole) {
    if (item === part[at]) {
      at += 1;
    }
  }
  return at === part.length;
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

// Escape codes a sender writes: the ones the rule reads, and ones that
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
// character, escape sequences from WIRE_CODES that hold no delimiter, and
// escape characters on their own. An array of units, since `fc.string` checks
// its list of awkward strings against each new unit, which is slow when the
// unit refuses a letter.
const arbWire = (d: Delimiters): fc.Arbitrary<string> => {
  const sequences = WIRE_CODES.filter((code) => !holdsSyntax(code, d)).map(
    (code) => `${d.escape}${code}${d.escape}`
  );
  return fc
    .array(
      fc.oneof(
        fc
          .string({ maxLength: 1, minLength: 1, unit: "grapheme" })
          .filter((ch) => !holdsSyntax(ch, d)),
        fc.constantFrom(...sequences, d.escape)
      )
    )
    .map((units) => units.join(""));
};

describe("escapes.read", () => {
  it("decodes the separator escapes to the default separators", () => {
    expect(
      escapes.read(
        "Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub",
        DEFAULT_DELIMITERS
      )
    ).toBe("Value|More^Stuff~Again&Sub");
  });

  it("decodes the separator escapes to custom separators", () => {
    expect(
      escapes.read("Value#F#More#S#Stuff#R#Again#T#Sub", CUSTOM_DELIMITERS)
    ).toBe("Value*More$Stuff%Again@Sub");
  });

  it("keeps the escape character escape as it is, since a decoded escape character would read as the start of a sequence", () => {
    expect(escapes.read("Smith\\E\\Jones", DEFAULT_DELIMITERS)).toBe(
      "Smith\\E\\Jones"
    );
  });

  it("keeps the truncation character escape as it is", () => {
    expect(escapes.read("abcde\\P\\", DEFAULT_DELIMITERS)).toBe("abcde\\P\\");
  });

  it("keeps .br as it is, since it is a formatting command and not a character", () => {
    expect(escapes.read("Line1\\.br\\Line2", DEFAULT_DELIMITERS)).toBe(
      "Line1\\.br\\Line2"
    );
  });

  it("decodes the hex escape of a control character to that character", () => {
    expect(
      escapes.read("Hello\\X0A\\World\\X0D\\Done\\X09\\", DEFAULT_DELIMITERS)
    ).toBe("Hello\nWorld\rDone\t");
  });

  it("keeps a hex escape of a control character with lowercase digits as it is, since it is written with uppercase digits", () => {
    expect(escapes.read("a\\X0d\\b", DEFAULT_DELIMITERS)).toBe("a\\X0d\\b");
  });

  it("keeps a hex escape of more than one byte as it is", () => {
    expect(escapes.read("a\\X0D0A\\b\\X414243\\", DEFAULT_DELIMITERS)).toBe(
      "a\\X0D0A\\b\\X414243\\"
    );
  });

  it("keeps a hex escape of a character the rule does not escape as it is, since that character has a second form on the wire", () => {
    expect(
      escapes.read("caf\\XC3A9\\ \\X41\\ \\X7C\\", DEFAULT_DELIMITERS)
    ).toBe("caf\\XC3A9\\ \\X41\\ \\X7C\\");
  });

  it("decodes the hex escape of a separator whose named code holds a delimiter", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "F" };

    expect(escapes.read("a#X2A#b", d)).toBe("a*b");
  });

  it("keeps the hex escape of the escape character as it is", () => {
    expect(
      escapes.read("a<X3C<b", {
        ...CUSTOM_DELIMITERS,
        component: "E",
        escape: "<",
      })
    ).toBe("a<X3C<b");
  });

  it("leaves a hex escape with an odd number of digits untouched", () => {
    expect(escapes.read("A\\X414\\B\\X4\\C", DEFAULT_DELIMITERS)).toBe(
      "A\\X414\\B\\X4\\C"
    );
  });

  it("leaves a hex escape whose bytes are not UTF-8 untouched", () => {
    expect(escapes.read("caf\\XE9\\ \\XC3\\", DEFAULT_DELIMITERS)).toBe(
      "caf\\XE9\\ \\XC3\\"
    );
  });

  it("leaves a hex escape without digits untouched", () => {
    expect(escapes.read("A\\X\\B", DEFAULT_DELIMITERS)).toBe("A\\X\\B");
  });

  it("leaves a hex escape whose content is not hexadecimal digits untouched", () => {
    expect(escapes.read("A\\X-1\\B\\XZZ\\C", DEFAULT_DELIMITERS)).toBe(
      "A\\X-1\\B\\XZZ\\C"
    );
  });

  it("leaves an unknown escape untouched", () => {
    expect(escapes.read("Unknown\\ABC\\Value", DEFAULT_DELIMITERS)).toBe(
      "Unknown\\ABC\\Value"
    );
  });

  it("keeps the highlight commands as they are", () => {
    expect(
      escapes.read("\\H\\Important\\N\\ value\\F\\pipe", DEFAULT_DELIMITERS)
    ).toBe("\\H\\Important\\N\\ value|pipe");
  });

  it("keeps a sequence whose content is the escape of a separator, as two sequences around it", () => {
    expect(escapes.read("\\E\\F\\E\\", DEFAULT_DELIMITERS)).toBe("\\E\\F\\E\\");
  });

  it("keeps a formatting command as it is", () => {
    expect(
      escapes.read("a\\.sp 2\\b\\.in+4\\c\\.ce\\d", DEFAULT_DELIMITERS)
    ).toBe("a\\.sp 2\\b\\.in+4\\c\\.ce\\d");
  });

  it("keeps a locally defined sequence as it is", () => {
    expect(escapes.read("a\\Zsite 7\\b\\Z\\c", DEFAULT_DELIMITERS)).toBe(
      "a\\Zsite 7\\b\\Z\\c"
    );
  });

  it("keeps a character set switch as it is", () => {
    expect(
      escapes.read("\\C2842\\abc\\M2442\\def\\M242844\\ghi", DEFAULT_DELIMITERS)
    ).toBe("\\C2842\\abc\\M2442\\def\\M242844\\ghi");
  });

  it("leaves an escape character without a closing one untouched", () => {
    expect(escapes.read("Value\\Unterminated", DEFAULT_DELIMITERS)).toBe(
      "Value\\Unterminated"
    );
  });

  it("returns a value without escapes as it is", () => {
    expect(escapes.read("PlainValue", DEFAULT_DELIMITERS)).toBe("PlainValue");
  });
});

describe("escapes.write", () => {
  it("encodes every separator and a carriage return, and an escape character without a closing one before the carriage return", () => {
    expect(escapes.write("a|b^c~d&e\\f\rg", DEFAULT_DELIMITERS)).toBe(
      "a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f\\X0D\\g"
    );
  });

  it("encodes custom delimiters", () => {
    expect(escapes.write("a*b$c%d@e#f\rg", CUSTOM_DELIMITERS)).toBe(
      "a#F#b#S#c#R#d#T#e#E#f#X0D#g"
    );
  });

  it("encodes a control character as a hex escape", () => {
    expect(escapes.write("line\nfeed\ttab", DEFAULT_DELIMITERS)).toBe(
      "line\\X0A\\feed\\X09\\tab"
    );
  });

  it("writes a formatting command as it is", () => {
    expect(
      escapes.write("\\H\\a|b\\N\\ \\.sp 2\\c\\.in+4\\d", DEFAULT_DELIMITERS)
    ).toBe("\\H\\a\\F\\b\\N\\ \\.sp 2\\c\\.in+4\\d");
  });

  it("writes a locally defined sequence as it is", () => {
    expect(escapes.write("a\\Zsite 7\\b|\\Z\\c", DEFAULT_DELIMITERS)).toBe(
      "a\\Zsite 7\\b\\F\\\\Z\\c"
    );
  });

  it("writes a character set switch as it is", () => {
    expect(
      escapes.write("\\C2842\\a|b\\M2442\\c\\M242844\\d", DEFAULT_DELIMITERS)
    ).toBe("\\C2842\\a\\F\\b\\M2442\\c\\M242844\\d");
  });

  it("encodes a delimiter inside a locally defined sequence, and both of its escape characters as data", () => {
    expect(
      escapes.write("a\\Zfoo|bar\\b\\Zx^y~z&w\\c\\Zq\rr\\d", DEFAULT_DELIMITERS)
    ).toBe(
      "a\\E\\Zfoo\\F\\bar\\E\\b\\E\\Zx\\S\\y\\R\\z\\T\\w\\E\\c\\E\\Zq\\X0D\\r\\E\\d"
    );
  });

  it("encodes a control character inside a locally defined sequence", () => {
    expect(escapes.write("a\\Zfoo\nbar\\b", DEFAULT_DELIMITERS)).toBe(
      "a\\E\\Zfoo\\X0A\\bar\\E\\b"
    );
  });

  it("writes a sequence as it is whatever its code", () => {
    expect(
      escapes.write(
        "\\h\\a\\Q\\b\\.BR\\c\\P\\d\\E\\e\\X41\\f\\.br\\g",
        DEFAULT_DELIMITERS
      )
    ).toBe("\\h\\a\\Q\\b\\.BR\\c\\P\\d\\E\\e\\X41\\f\\.br\\g");
  });

  it("writes the escape of a separator in a value as it is, as the separator it stands for", () => {
    const wire = escapes.write("a\\F\\b", DEFAULT_DELIMITERS);

    expect(wire).toBe("a\\F\\b");
    expect(escapes.read(wire, DEFAULT_DELIMITERS)).toBe("a|b");
  });

  it("writes a character set switch with the escape character MSH-2 declares", () => {
    expect(escapes.write("#C2842#a*b#M2442#c", CUSTOM_DELIMITERS)).toBe(
      "#C2842#a#F#b#M2442#c"
    );
  });

  it("leaves an escape character as it is when no separator or control character comes before its closing one", () => {
    expect(escapes.write("C:\\temp", DEFAULT_DELIMITERS)).toBe("C:\\temp");
    expect(escapes.write("a\\Q\\b\\.sp|2\\c\\", DEFAULT_DELIMITERS)).toBe(
      "a\\Q\\b\\E\\.sp\\F\\2\\E\\c\\"
    );
  });

  it("writes an escape character without a closing one as `\\E\\` when a separator follows it, so it does not pair with the separator's escape", () => {
    const wire = escapes.write("a\\b|c", DEFAULT_DELIMITERS);

    expect(wire).toBe("a\\E\\b\\F\\c");
    expect(escapes.read(wire, DEFAULT_DELIMITERS)).toBe("a\\E\\b|c");
  });

  it("writes an escape character as data as its hexadecimal escape when `E` is a delimiter", () => {
    const d = { ...DEFAULT_DELIMITERS, component: "E" };

    expect(escapes.write("a\\b|c", d)).toBe("a\\X5C\\b\\F\\c");
  });

  it("keeps a tab after an escape character without a closing one through a relay", () => {
    // HL7v2 §2.7.1: escape sequences do not nest. `\X09\` written after the
    // bare `\` would pair with it and lose the tab.
    const value = escapes.read("see C:\\scans\tnote", DEFAULT_DELIMITERS);
    const wire = escapes.write(value, DEFAULT_DELIMITERS);

    expect(wire).toBe("see C:\\E\\scans\\X09\\note");
    expect(escapes.read(wire, DEFAULT_DELIMITERS)).toBe(
      "see C:\\E\\scans\tnote"
    );
    expect(
      escapes.write(escapes.read(wire, DEFAULT_DELIMITERS), DEFAULT_DELIMITERS)
    ).toBe(wire);
  });

  it("returns a value without special characters as it is", () => {
    expect(escapes.write("PlainValue123", DEFAULT_DELIMITERS)).toBe(
      "PlainValue123"
    );
  });

  it("returns an empty value as it is", () => {
    expect(escapes.write("", DEFAULT_DELIMITERS)).toBe("");
  });

  it("writes a character whose escape code is a delimiter as a hex escape", () => {
    expect(escapes.write("a*b", { ...CUSTOM_DELIMITERS, component: "F" })).toBe(
      "a#X2A#b"
    );
  });

  it("leaves the escape character as it is when it is E", () => {
    expect(escapes.write("aEb", { ...CUSTOM_DELIMITERS, escape: "E" })).toBe(
      "aEb"
    );
  });

  it("writes a hex escape with lowercase digits when an uppercase digit is a delimiter", () => {
    expect(
      escapes.write("a~b", {
        ...CUSTOM_DELIMITERS,
        component: "E",
        field: "R",
        repetition: "~",
      })
    ).toBe("a#X7e#b");
  });

  it("writes a carriage return and a line feed as hex escapes with any delimiters", () => {
    expect(escapes.write("a\rb\nc", { ...CUSTOM_DELIMITERS, field: "." })).toBe(
      "a#X0D#b#X0A#c"
    );
  });

  it("throws for a character no escape sequence can write", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "S", field: "X" };
    const thrown = (): unknown => {
      try {
        escapes.write("aSb", d);
      } catch (error) {
        return error;
      }
      return undefined;
    };

    const error = thrown();

    expect(error).toBeInstanceOf(EscapeSequenceError);
    expect((error as EscapeSequenceError).character).toBe("S");
    expect((error as EscapeSequenceError).delimiters).toStrictEqual(d);
    expect((error as EscapeSequenceError).message).toBe(
      "The value holds a character that must be written as an escape sequence, and every escape sequence for it holds one of the message's delimiters. With delimiters that are ASCII punctuation, every character can be written."
    );
  });

  it("keeps an escape sequence whose code shares a digit with a delimiter of two UTF-16 units", () => {
    const d = { ...DEFAULT_DELIMITERS, field: "😀" };

    expect(escapes.write("\\a0b\\", d)).toBe("\\a0b\\");
  });

  it("writes a hex digit in lowercase only where its uppercase form is a delimiter", () => {
    const d: Delimiters = {
      component: "é",
      escape: "\\",
      field: "S",
      repetition: "C",
      subcomponent: "a",
    };
    const wire = escapes.write("é", d);

    expect(wire).toBe("\\Xc3A9\\");
    expect(escapes.read(wire, d)).toBe("é");
  });

  it("throws for a lone surrogate it must escape", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "T", subcomponent: "\uD83D" };

    expect(() => escapes.write("a\uD83Db", d)).toThrow(EscapeSequenceError);
  });

  it("encodes a separator inside a formatting command, and both of its escape characters as data", () => {
    const d = { ...DEFAULT_DELIMITERS, component: "H" };

    expect(escapes.write("\\H\\", d)).toBe("\\E\\\\S\\\\E\\");
  });

  // HL7v2 §2.7.1: a sender escapes every delimiter in a value. A value read
  // from the wire and written again is the value that arrived: each code of
  // the rule is read as its character and written as that code, and every
  // other escape sequence, and every escape character, stays as written.
  // Reading it a second time changes nothing. The domain is every value a
  // sender writes with any five delimiters, including one with an escape
  // character that has no closing one.
  //
  // Mutant: `read` looks a code up in uppercase. Fails on `\X0d\`, read as a
  // carriage return and written as `\X0D\`.
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
          const value = escapes.read(wire, d);

          expect(escapes.read(value, d)).toBe(value);
          expect(escapes.write(value, d)).toBe(wire);
        }
      ),
      {
        examples: [
          [
            [
              DEFAULT_DELIMITERS,
              "a\\X7C\\b\\F\\c\\E\\d\\.br\\e\\X0D\\f\\X0D0A\\g\\E\\F\\E\\h\\",
            ],
          ],
        ],
      }
    );
  });

  // Any value is written with no separator and no control character, so the
  // parser splits the message where its delimiters are. Every separator and
  // control character of the value is read back from what is written: an
  // escape character is written `\E\` where its escape sequence would pair
  // with the escape of one of them. The written value is written the same way
  // again, and read and written back unchanged. With delimiters that are
  // letters or digits, a value may hold a character that no escape code
  // writes; EscapeSequenceError names it, and that outcome is correct.
  //
  // Mutants: the rule leaves out the subcomponent separator, which fails on
  // `&`, written as it is; and `write` keeps every escape character, which
  // fails on `\&`, read back as `\T\`.
  it("writes any value as a value the parser splits correctly and reads back its separators and control characters from, or throws EscapeSequenceError for a character none can write", () => {
    fc.assert(
      fc.property(
        arbDelimiters(
          fc.oneof(fc.constantFrom(...ESCAPE_CODE_CHARACTERS), fc.char())
        ).chain((d) => fc.tuple(fc.constant(d), arbValue(d))),
        ([d, value]) => {
          let wire: string;
          try {
            wire = escapes.write(value, d);
          } catch (error) {
            expectRefused(error, value, d);
            return;
          }

          expect(heldDelimiters(wire, d)).toEqual([]);
          expect(
            isSubsequence(
              separatorsAndControls(value, d),
              separatorsAndControls(escapes.read(wire, d), d)
            )
          ).toBe(true);
          expect(escapes.write(wire, d)).toBe(wire);
          expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
        }
      ),
      {
        examples: [
          [[DEFAULT_DELIMITERS, "\\|\\&"]],
          [[DEFAULT_DELIMITERS, "\\&"]],
          [[DEFAULT_DELIMITERS, "see C:\\scans\tnote"]],
          [[{ ...DEFAULT_DELIMITERS, component: "X", field: "S" }, "^"]],
        ],
      }
    );
  });

  // A value without the escape character is written and read back as the
  // same value, with any five delimiters. With delimiters that are letters or
  // digits, a value may hold a character that no escape code writes;
  // EscapeSequenceError names it, and that outcome is correct.
  //
  // Mutants: the rule names the subcomponent separator `S` instead of `T`,
  // which fails on `&`, read back as `^`; and `read` returns its text, which
  // fails on `|` with `F` as the component separator, read back as `\X7C\`.
  it("reads back any value that holds no escape character", () => {
    fc.assert(
      fc.property(
        arbDelimiters(
          fc.oneof(
            fc.constantFrom(...PUNCTUATION),
            fc.constantFrom(...ESCAPE_CODE_CHARACTERS),
            fc.char()
          )
        ).chain((d) =>
          fc.tuple(
            fc.constant(d),
            arbValue(d).map((value) => value.replaceAll(d.escape, ""))
          )
        ),
        ([d, value]) => {
          let wire: string;
          try {
            wire = escapes.write(value, d);
          } catch (error) {
            expectRefused(error, value, d);
            return;
          }

          expect(escapes.read(wire, d)).toBe(value);
        }
      ),
      {
        examples: [
          [[DEFAULT_DELIMITERS, "&"]],
          [[{ ...DEFAULT_DELIMITERS, component: "F" }, "|"]],
        ],
      }
    );
  });
});
