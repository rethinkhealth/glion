import type { Delimiters } from "@glion/ast";

import { EscapeSequenceError } from "./errors";

// `escapes.read` and `escapes.write` change only the characters a value
// cannot hold as they are, and leave everything else as written. With the
// usual delimiters `|^~\&`:
//
//   read                                 write
//   SMITH\T\JONES  →  SMITH&JONES        SMITH&JONES  →  SMITH\T\JONES
//   a\X0D\b        →  a␍b                a␍b          →  a\X0D\b
//   1\.br\2        →  1\.br\2            1\.br\2      →  1\.br\2
//   Smith\E\Jones  →  Smith\E\Jones      C:\temp      →  C:\temp
//
// The file reads top down:
//
//   escapes        the two functions other packages call
//   read           text on the wire → value
//   write          value → text on the wire
//   dataEscapes    which escape characters `write` must change
//   the table      which character each code stands for, for a set of delimiters
//
// Both directions use one table, so they agree: `read` turns a code back into
// the character `write` writes with it. `\X7C\` stays as written, since `|` is
// written `\F\`.

/** Reads and writes the escape sequences of a subcomponent value. */
export interface Escapes {
  /**
   * The value the wire text `text` stands for.
   *
   * Reads `\F\`, `\S\`, `\R\`, and `\T\` as the separator each stands for,
   * and the `\Xdd\` that {@link Escapes.write} writes for a character below
   * U+0020 (uppercase digits, such as `\X0D\`) as that character. A separator
   * whose named code holds a delimiter is read from the `\Xdd\`
   * {@link Escapes.write} writes for it. Leaves every other escape sequence as
   * it is written: `\E\`, `\P\`, `\H\`, `\N\`, a formatting command such as
   * `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, an unknown code, and an
   * escape character without a closing one.
   *
   * Idempotent. `d` MUST hold five distinct characters.
   *
   * @param text - The value as it is on the wire.
   * @param d - The delimiters of the message.
   * @returns The value.
   */
  read(text: string, d: Delimiters): string;

  /**
   * The text `value` takes on the wire.
   *
   * Writes the field, component, repetition, and subcomponent separators as
   * `\F\`, `\S\`, `\R\`, and `\T\`, and any other character below U+0020 as
   * `\Xdd\`. A character whose escape code holds a delimiter, such as `|` when
   * `F` is the component separator, is written as `\Xdd\`, the hexadecimal
   * escape of its UTF-8 bytes, with a digit `A`–`F` in lowercase when its
   * uppercase form is a delimiter. Every other character is written as it is,
   * the escape character included, except an escape character whose closing
   * one, or the end of the value when it has none, comes after a separator or
   * a character below U+0020: that one is written `\E\`, or its `\Xdd\` when
   * `E` is a delimiter.
   *
   * The text holds no separator and no character below U+0020. Idempotent.
   * For every text `w` that holds no separator and no character below U+0020,
   * `write(read(w, d), d)` is `w`. `d` MUST hold five distinct characters.
   *
   * @param value - The value to write.
   * @param d - The delimiters of the message.
   * @returns The text on the wire.
   * @throws {EscapeSequenceError} When a character must be escaped and every
   *   escape code that writes it holds a delimiter.
   */
  write(value: string, d: Delimiters): string;
}

const CONTROL_END = 0x20;
const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
const UTF16_UNIT_LENGTH = 4;
const UTF8_ENCODER = new TextEncoder();

/** Reads and writes the characters a value cannot hold as they are. */
export const escapes: Escapes = {
  read: (text, d) => read(text, d.escape, tableFor(d)),
  write: (value, d) => write(value, d.escape, tableFor(d)),
};

// ## Reading
//
// Walks the text one pair of escape characters at a time. The code between a
// pair is looked up in the table, and a code the table does not hold stays in
// the value as written. `a\T\b\.br\c` becomes `a&b\.br\c`:
//
//   pair \T\     T is in the table:  copy `a`, then `&`
//   pair \.br\   not in the table:   nothing to copy yet
//   end                              copy the rest, `b\.br\c`
function read(text: string, escape: string, table: EscapeTable): string {
  let value = "";
  // Where the text not yet copied to `value` starts.
  let copied = 0;
  let start = text.indexOf(escape);

  while (start !== -1) {
    const end = text.indexOf(escape, start + 1);
    if (end === -1) {
      // An escape character without a closing one stays as written.
      break;
    }
    const ch = table.characters.get(text.slice(start + 1, end));
    if (ch !== undefined) {
      value += text.slice(copied, start) + ch;
      copied = end + 1;
    }
    start = text.indexOf(escape, end + 1);
  }

  return value + text.slice(copied);
}

// ## Writing
//
// Replaces each character the table holds with its escape sequence, and copies
// the rest. `a&b|c` becomes `a\T\b\F\c`:
//
//   &   `\T\`
//   |   `\F\`
//
// An escape character stays as it is, unless `dataEscapes` says otherwise. A
// value that holds no character of the table is returned as it is, which is
// nearly every value.
function write(value: string, escape: string, table: EscapeTable): string {
  if (!table.holdsCharacter.test(value)) {
    return value;
  }
  const data = dataEscapes(value, escape, table);

  return value.replace(table.writtenCharacters, (ch, position: number) => {
    if (ch === escape && !data.has(position)) {
      return ch;
    }
    const code = ch === escape ? table.escapeCode : table.codes.get(ch);
    // With `X` and `S` both delimiters, `S` has no code: `\S\` holds `S`, and
    // every `\X53\` holds `X`.
    if (code === undefined) {
      throw new EscapeSequenceError(ch, table.delimiters);
    }
    return escape + code + escape;
  });
}

// The escape characters of `value` that must be written `\E\`. Most stay as
// they are, as in `1\.br\2`. One must change when `write` is about to write an
// escape sequence between it and its closing one, because the new sequence
// would pair with it:
//
//   \Zfoo|bar\     the pair holds `|`:  both written \E\   \E\Zfoo\F\bar\E\
//   C:\scans␉note  no closing one, and  the one written \E\
//                  `␉` comes after it:                     C:\E\scans\X09\note
//   1\.br\2        the pair holds none: both stay          1\.br\2
//
// Returns the positions of those escape characters. A pair with no closing
// escape character runs to the end of the value, so `close` may be a position
// no character is at.
function dataEscapes(
  value: string,
  escape: string,
  table: EscapeTable
): ReadonlySet<number> {
  const data = new Set<number>();
  let start = value.indexOf(escape);
  while (start !== -1) {
    const end = value.indexOf(escape, start + 1);
    const close = end === -1 ? value.length : end;
    if (table.holdsCharacter.test(value.slice(start + 1, close))) {
      data.add(start).add(close);
    }
    start = end === -1 ? -1 : value.indexOf(escape, end + 1);
  }
  return data;
}

// ## The table
//
// Which characters have an escape sequence, and which code writes each, depends
// on the delimiters. Reading and writing look them up in a table, and the last
// table is reused while the delimiters stay the same. With `|^~\&`:
//
//   codes           | → F   ^ → S   ~ → R   & → T   CR → X0D   LF → X0A   …
//   characters      F → |   S → ^   R → ~   T → &   X0D → CR   X0A → LF   …
//   escapeCode      E
//   holdsCharacter  matches | ^ ~ & and every character below U+0020
interface EscapeTable {
  readonly delimiters: Delimiters;
  /** The code that writes each character, or `undefined` when none can. */
  readonly codes: ReadonlyMap<string, string | undefined>;
  /** The character each code writes. */
  readonly characters: ReadonlyMap<string, string>;
  /** The code that writes the escape character as data. */
  readonly escapeCode: string | undefined;
  /** Matches any character of `codes`. */
  readonly holdsCharacter: RegExp;
  /** Matches every character of `codes`, and the escape character. */
  readonly writtenCharacters: RegExp;
}

let lastTable: EscapeTable | undefined;

function tableFor(d: Delimiters): EscapeTable {
  if (lastTable === undefined || !sameDelimiters(lastTable.delimiters, d)) {
    lastTable = buildTable(d);
  }
  return lastTable;
}

function sameDelimiters(a: Delimiters, b: Delimiters): boolean {
  return (
    a.field === b.field &&
    a.component === b.component &&
    a.repetition === b.repetition &&
    a.escape === b.escape &&
    a.subcomponent === b.subcomponent
  );
}

function buildTable(d: Delimiters): EscapeTable {
  const codes = separatorsAndControlCharacters(d);
  const characters = new Map<string, string>();
  for (const [ch, code] of codes) {
    if (code !== undefined) {
      characters.set(code, ch);
    }
  }
  return {
    characters,
    codes,
    delimiters: { ...d },
    escapeCode: namedOrHexCode(d.escape, "E", d),
    holdsCharacter: new RegExp(characterClass([...codes.keys()])),
    writtenCharacters: new RegExp(
      characterClass([...codes.keys(), d.escape]),
      "g"
    ),
  };
}

// A character class that matches one UTF-16 unit, with each character as
// `\uXXXX`, so that none means anything in the expression. A delimiter of two
// units is left out, since the class would match each of its units alone.
function characterClass(characters: readonly string[]): string {
  const units = characters
    .filter((ch) => ch.length === 1)
    .map((ch) => {
      const hex = (ch.codePointAt(0) ?? 0).toString(HEX_RADIX);
      return `\\u${hex.padStart(UTF16_UNIT_LENGTH, "0")}`;
    });
  return `[${units.join("")}]`;
}

/**
 * The characters written as escape sequences with the delimiters `d`, each
 * with the code that writes it, or `undefined` when every code for it holds a
 * delimiter. Never holds the escape character.
 */
function separatorsAndControlCharacters(
  d: Delimiters
): ReadonlyMap<string, string | undefined> {
  const codes = new Map<string, string | undefined>([
    [d.field, namedOrHexCode(d.field, "F", d)],
    [d.component, namedOrHexCode(d.component, "S", d)],
    [d.repetition, namedOrHexCode(d.repetition, "R", d)],
    [d.subcomponent, namedOrHexCode(d.subcomponent, "T", d)],
  ]);
  for (let point = 0; point < CONTROL_END; point += 1) {
    const ch = String.fromCodePoint(point);
    if (ch !== d.escape && !codes.has(ch)) {
      codes.set(ch, hexCode(ch, d));
    }
  }
  return codes;
}

// A code must not hold a delimiter, or the parser would split the sequence.
// HL7v2 allows letters as delimiters, so a named code may not be usable: with
// `R` as the field separator, `~` cannot be written `\R\`, so it takes its
// hexadecimal code instead.
function namedOrHexCode(
  ch: string,
  named: string,
  d: Delimiters
): string | undefined {
  return holdsDelimiter(named, d) ? hexCode(ch, d) : named;
}

// The hexadecimal code of the UTF-8 bytes of `ch`: `~` is the byte 0x7E, so
// `X7E`. A digit `A`–`F` that is a delimiter is written in lowercase. A digit
// `0`–`9` or the `X` has no other form, so a code that still holds a delimiter
// is no code at all.
function hexCode(ch: string, d: Delimiters): string | undefined {
  // A lone surrogate has no UTF-8 bytes.
  if (!ch.isWellFormed()) {
    return undefined;
  }
  let code = "X";
  for (const byte of UTF8_ENCODER.encode(ch)) {
    const pair = byte
      .toString(HEX_RADIX)
      .toUpperCase()
      .padStart(HEX_PAIR_LENGTH, "0");
    for (const digit of pair) {
      code += holdsDelimiter(digit, d) ? digit.toLowerCase() : digit;
    }
  }
  return holdsDelimiter(code, d) ? undefined : code;
}

function holdsDelimiter(code: string, d: Delimiters): boolean {
  return [d.field, d.component, d.repetition, d.escape, d.subcomponent].some(
    (delimiter) => code.includes(delimiter)
  );
}
