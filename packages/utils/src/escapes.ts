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
// Both directions look characters and codes up in one table, built from the
// rule once per set of delimiters: `read` turns a code into the character the
// table writes with it, so `\X7C\` stays as written, since `|` is written
// `\F\`.
//
// `write` keeps every escape character as it is, except one whose closing
// escape character, or the end of the value when it has none, comes after a
// character of the table. The escape sequence written for that character
// would pair with it, so it is written `\E\`:
//
//   C:\scans␉note  →  C:\E\scans\X09\note     \Zfoo|bar\  →  \E\Zfoo\F\bar\E\

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

/**
 * The characters written as escape sequences with the delimiters `d`, each
 * with the code that writes it, or `undefined` when every code for it holds a
 * delimiter. Never holds the escape character.
 */
type EscapeRule = (d: Delimiters) => ReadonlyMap<string, string | undefined>;

/** An {@link EscapeRule} for one set of delimiters, ready to look up. */
interface EscapeTable {
  readonly delimiters: Delimiters;
  /** The code that writes each character of the rule. */
  readonly codes: ReadonlyMap<string, string | undefined>;
  /** The character each code of the rule writes. */
  readonly characters: ReadonlyMap<string, string>;
  /**
   * For each character below U+0080: `RULE_CHARACTER` for a character of the
   * rule, `ESCAPE_CHARACTER` for the escape character, and `PLAIN` for any
   * other.
   */
  readonly ascii: Uint8Array;
  /** The code that writes the escape character as data. */
  readonly escapeCode: string | undefined;
}

const ASCII_END = 0x80;
const PLAIN = 0;
const RULE_CHARACTER = 1;
const ESCAPE_CHARACTER = 2;
const CONTROL_END = 0x20;
const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
const UTF8_ENCODER = new TextEncoder();
const NO_POSITIONS: ReadonlySet<number> = new Set();
// Each set of delimiters costs one table; past this many, the cache starts
// over, so a stream of messages with ever new delimiters cannot grow it.
const MAX_CACHED_TABLES = 64;

// The rule HL7v2 structure requires. With the usual delimiters `|^~\&`:
//
//   |  ↔  F        ^  ↔  S        ~  ↔  R        &  ↔  T
//   a carriage return  ↔  X0D     a line feed  ↔  X0A
//   any other character below U+0020  ↔  Xdd
//
// A separator whose named code holds a delimiter takes the hexadecimal code
// of its UTF-8 bytes instead: with `R` as the field separator and `E` as the
// component separator, `~` ↔ `X7e`.
const separatorsAndControlCharacters: EscapeRule = (d) => {
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
};

/**
 * The table of `rule` for a set of delimiters, built once and reused while
 * the delimiters stay the same.
 */
function createTables(rule: EscapeRule): (d: Delimiters) => EscapeTable {
  const cache = new Map<string, EscapeTable>();
  let last: EscapeTable | undefined;

  const tableFor = (d: Delimiters): EscapeTable => {
    if (last !== undefined && sameDelimiters(last.delimiters, d)) {
      return last;
    }
    const key =
      d.field + d.component + d.repetition + d.escape + d.subcomponent;
    let table = cache.get(key);
    if (table === undefined) {
      if (cache.size >= MAX_CACHED_TABLES) {
        cache.clear();
      }
      table = buildTable(rule, d);
      cache.set(key, table);
    }
    last = table;
    return table;
  };

  return tableFor;
}

const tableFor = createTables(separatorsAndControlCharacters);

/** Reads and writes the characters a value cannot hold as they are. */
export const escapes: Escapes = {
  read: (text, d) => read(text, d, tableFor(d)),
  write: (value, d) => write(value, d, tableFor(d), refuse),
};

/**
 * The length HL7v2 §2.7.1 counts for `value` on the wire: the text
 * `escapes.write` writes, each escape sequence by the characters between its
 * two escape characters. A character no escape sequence can write with `d`
 * counts one.
 *
 * Never throws.
 */
export function escapedLength(value: string, d: Delimiters): number {
  const text = write(value, d, tableFor(d), countAsOne);
  const escapeCharacters = text.split(d.escape).length - 1;
  return text.length - 2 * Math.floor(escapeCharacters / 2);
}

function buildTable(rule: EscapeRule, d: Delimiters): EscapeTable {
  const codes = rule(d);
  const characters = new Map<string, string>();
  const ascii = new Uint8Array(ASCII_END);
  for (const [ch, code] of codes) {
    if (code !== undefined) {
      characters.set(code, ch);
    }
    markAscii(ascii, ch, RULE_CHARACTER);
  }
  markAscii(ascii, d.escape, ESCAPE_CHARACTER);
  return {
    ascii,
    characters,
    codes,
    delimiters: { ...d },
    escapeCode: namedOrHexCode(d.escape, "E", d),
  };
}

function read(text: string, d: Delimiters, table: EscapeTable): string {
  let start = text.indexOf(d.escape);
  if (start === -1) {
    return text;
  }

  // Runs of text between the sequences the table decodes are copied in one
  // slice: `copied` marks where the run not yet copied starts.
  let value = "";
  let copied = 0;

  while (start !== -1) {
    const end = text.indexOf(d.escape, start + 1);
    if (end === -1) {
      break;
    }
    // The escape code is the text between the two, such as `T` in `\T\`.
    const ch = table.characters.get(text.slice(start + 1, end));
    if (ch !== undefined) {
      value += text.slice(copied, start) + ch;
      copied = end + 1;
    }
    start = text.indexOf(d.escape, end + 1);
  }

  return value + text.slice(copied);
}

/**
 * The text `value` takes on the wire, with `unwritable` giving the code for a
 * character every escape code of which holds a delimiter.
 */
function write(
  value: string,
  d: Delimiters,
  table: EscapeTable,
  unwritable: (ch: string, d: Delimiters) => string
): string {
  const data = dataEscapes(value, d, table);
  // `copied` marks where the run of characters not yet written starts; the
  // run is copied in one slice when an escape sequence follows it, or at the
  // end.
  let text = "";
  let copied = 0;

  for (let i = 0; i < value.length; i += 1) {
    const point = value.codePointAt(i) ?? 0;
    if (point < ASCII_END && table.ascii[point] === PLAIN) {
      continue;
    }
    const ch = value.charAt(i);
    let code: string | undefined;
    if (ch === d.escape) {
      if (!data.has(i)) {
        continue;
      }
      code = table.escapeCode;
    } else if (table.codes.has(ch)) {
      code = table.codes.get(ch);
    } else {
      continue;
    }

    // With `X` and `S` both delimiters, `S` cannot be written: `\S\` holds
    // `S`, and every `\X53\` holds `X`.
    text +=
      value.slice(copied, i) +
      d.escape +
      (code ?? unwritable(ch, d)) +
      d.escape;
    copied = i + 1;
  }

  return text + value.slice(copied);
}

function refuse(ch: string, d: Delimiters): never {
  throw new EscapeSequenceError(ch, d);
}

// A code as long as the character, so the character counts one.
function countAsOne(ch: string): string {
  return ch;
}

/**
 * The positions of the escape characters in `value` that are written as
 * data: both of a pair that holds a character of the table, and one without a
 * closing one that comes before such a character.
 */
function dataEscapes(
  value: string,
  d: Delimiters,
  table: EscapeTable
): ReadonlySet<number> {
  let start = value.indexOf(d.escape);
  if (start === -1) {
    return NO_POSITIONS;
  }
  const data = new Set<number>();
  while (start !== -1) {
    const end = value.indexOf(d.escape, start + 1);
    const close = end === -1 ? value.length : end;
    if (holdsTableCharacter(value, start + 1, close, table)) {
      data.add(start).add(close);
    }
    start = end === -1 ? -1 : value.indexOf(d.escape, end + 1);
  }
  return data;
}

function markAscii(ascii: Uint8Array, ch: string, mark: number): void {
  const point = ch.codePointAt(0) ?? ASCII_END;
  if (ch.length === 1 && point < ASCII_END) {
    ascii[point] = mark;
  }
}

function isTableCharacter(
  value: string,
  i: number,
  table: EscapeTable
): boolean {
  const point = value.codePointAt(i) ?? 0;
  return point < ASCII_END
    ? table.ascii[point] === RULE_CHARACTER
    : table.codes.has(value.charAt(i));
}

function holdsTableCharacter(
  value: string,
  from: number,
  to: number,
  table: EscapeTable
): boolean {
  for (let i = from; i < to; i += 1) {
    if (isTableCharacter(value, i, table)) {
      return true;
    }
  }
  return false;
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

/**
 * Whether `code` holds a delimiter or the escape character, which the parser
 * would read as the end of the escape sequence or of the value.
 */
function holdsDelimiter(code: string, d: Delimiters): boolean {
  return (
    code.includes(d.field) ||
    code.includes(d.component) ||
    code.includes(d.repetition) ||
    code.includes(d.subcomponent) ||
    code.includes(d.escape)
  );
}

function namedOrHexCode(
  ch: string,
  named: string,
  d: Delimiters
): string | undefined {
  return holdsDelimiter(named, d) ? hexCode(ch, d) : named;
}

function hexCode(ch: string, d: Delimiters): string | undefined {
  if (!ch.isWellFormed()) {
    return undefined;
  }
  // `~` is the byte 0x7E: `X7E`, or `X7e` when `E` is a delimiter.
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
  // A digit `0`–`9` or the `X` itself has no other form to fall back on.
  return holdsDelimiter(code, d) ? undefined : code;
}
