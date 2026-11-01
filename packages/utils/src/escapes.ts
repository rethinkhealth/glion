import type { Delimiters } from "@glion/ast";

import { EscapeSequenceError } from "./errors";

// `escapes.read` and `escapes.write` change only the characters a value
// cannot hold as they are, and leave everything else as written, the escape
// character included. With the usual delimiters `|^~\&`:
//
//   read                                 write
//   SMITH\T\JONES  →  SMITH&JONES        SMITH&JONES  →  SMITH\T\JONES
//   a\X0D\b        →  a␍b                a␍b          →  a\X0D\b
//   1\.br\2        →  1\.br\2            1\.br\2      →  1\.br\2
//   Smith\E\Jones  →  Smith\E\Jones      C:\temp      →  C:\temp
//
// Both directions take the characters and their codes from one EscapeRule.
// `read` turns a code into its character only when `write` writes that
// character with that same code: `\X7C\` stays as written, since `|` is
// written `\F\`.

/** Reads and writes the escape sequences of a subcomponent value. */
export interface Escapes {
  /**
   * The value the wire text `text` stands for.
   *
   * Reads `\F\`, `\S\`, `\R\`, and `\T\` as the separator each stands for,
   * and `\Xdd\` as the character below U+0020 it names. A separator whose
   * named code holds a delimiter is read from the hexadecimal escape
   * {@link Escapes.write} writes for it. Leaves every other escape sequence as
   * it is written: `\E\`, `\P\`, `\H\`, `\N\`, a formatting command such as
   * `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, an unknown code, and an
   * escape character without a closing one.
   *
   * Idempotent.
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
   * uppercase form is a delimiter. Every other character, the escape
   * character included, is written as it is.
   *
   * The text holds no field, component, repetition, or subcomponent separator
   * and no character below U+0020. Idempotent. For every text `w` that holds
   * no character below U+0020, `write(read(w, d), d)` is `w`.
   *
   * @param value - The value to write.
   * @param d - The delimiters of the message.
   * @returns The text on the wire.
   * @throws {EscapeSequenceError} When a separator or a character below
   *   U+0020 must be escaped and every escape code that writes it holds a
   *   delimiter.
   */
  write(value: string, d: Delimiters): string;
}

/**
 * The characters written as escape sequences, and the code of each.
 *
 * `codeFor` and `characterFor` are each other's inverse on the characters
 * `escapes` accepts.
 */
interface EscapeRule {
  /** Whether `ch` is written as an escape sequence. */
  escapes(ch: string, d: Delimiters): boolean;
  /**
   * The escape code that writes `ch`, such as `T` for `&`, or `undefined`
   * when every code for it holds a delimiter.
   */
  codeFor(ch: string, d: Delimiters): string | undefined;
  /**
   * The character the escape code `code` stands for, such as `&` for `T`, or
   * `undefined` when the sequence is not one of the rule's.
   */
  characterFor(code: string, d: Delimiters): string | undefined;
}

const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
const HEX_CODE = /^X(?:[0-9A-Fa-f]{2})+$/;
const SPACE = " ";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_ENCODER = new TextEncoder();

// The rule HL7v2 structure requires. With the usual delimiters `|^~\&`:
//
//   |  ↔  F        ^  ↔  S        ~  ↔  R        &  ↔  T
//   a carriage return  ↔  X0D     a line feed  ↔  X0A
//   any other character below U+0020  ↔  Xdd
//
// A separator whose named code holds a delimiter takes the hexadecimal code
// of its UTF-8 bytes instead: with `R` as the field separator and `E` as the
// component separator, `~` ↔ `X7e`. The escape character is not in the rule.
const SEPARATORS_AND_CONTROL_CHARACTERS: EscapeRule = {
  characterFor: (code, d) => namedCharacter(code, d) ?? hexCharacter(code),
  codeFor(ch, d) {
    const named = namedCode(ch, d);
    if (named !== undefined && !holdsDelimiter(named, d)) {
      return named;
    }
    return hexCode(ch, d);
  },
  escapes: (ch, d) =>
    ch === d.field ||
    ch === d.component ||
    ch === d.repetition ||
    ch === d.subcomponent ||
    (ch.length === 1 && ch < SPACE && ch !== d.escape),
};

/** Reads and writes the characters a value cannot hold as they are. */
export const escapes: Escapes = {
  read: (text, d) => read(SEPARATORS_AND_CONTROL_CHARACTERS, text, d),
  write: (value, d) => write(SEPARATORS_AND_CONTROL_CHARACTERS, value, d),
};

function read(rule: EscapeRule, text: string, d: Delimiters): string {
  // Stryker disable next-line ConditionalExpression, BlockStatement: a value without the escape character reads as itself through the loop as well; the return skips the loop
  if (!text.includes(d.escape)) {
    return text;
  }

  let value = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] !== d.escape) {
      value += text[i];
      i += 1;
      continue;
    }

    const end = text.indexOf(d.escape, i + 1);
    if (end === -1) {
      value += text.slice(i);
      break;
    }

    // The escape code is the text between the two, such as `T` in `\T\`.
    const code = text.slice(i + 1, end);
    const ch = rule.characterFor(code, d);
    const isRuleSequence =
      ch !== undefined && rule.escapes(ch, d) && rule.codeFor(ch, d) === code;
    value += isRuleSequence ? ch : text.slice(i, end + 1);
    i = end + 1;
  }

  return value;
}

function write(rule: EscapeRule, value: string, d: Delimiters): string {
  // Plain characters are not appended one at a time. `copied` marks where the
  // run of plain characters not yet written starts; the run is copied in one
  // slice when an escape sequence follows it, or at the end.
  let text = "";
  let copied = 0;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    if (!rule.escapes(ch, d)) {
      continue;
    }
    const code = rule.codeFor(ch, d);
    if (code === undefined) {
      // With `X` and `S` both delimiters, `S` cannot be written: `\S\` holds
      // `S`, and every `\X53\` holds `X`.
      throw new EscapeSequenceError(ch, d);
    }
    text += value.slice(copied, i) + d.escape + code + d.escape;
    copied = i + 1;
  }

  return text + value.slice(copied);
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

function namedCode(ch: string, d: Delimiters): string | undefined {
  switch (ch) {
    case d.field: {
      return "F";
    }
    case d.component: {
      return "S";
    }
    case d.repetition: {
      return "R";
    }
    case d.subcomponent: {
      return "T";
    }
    default: {
      return undefined;
    }
  }
}

function namedCharacter(code: string, d: Delimiters): string | undefined {
  switch (code) {
    case "F": {
      return d.field;
    }
    case "S": {
      return d.component;
    }
    case "R": {
      return d.repetition;
    }
    case "T": {
      return d.subcomponent;
    }
    default: {
      return undefined;
    }
  }
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

function hexCharacter(code: string): string | undefined {
  if (!HEX_CODE.test(code)) {
    return undefined;
  }
  const bytes = new Uint8Array((code.length - 1) / HEX_PAIR_LENGTH);
  for (let i = 0; i < bytes.length; i += 1) {
    const at = 1 + i * HEX_PAIR_LENGTH;
    bytes[i] = Number.parseInt(code.slice(at, at + HEX_PAIR_LENGTH), HEX_RADIX);
  }
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    // Bytes that are not UTF-8 name no character the rule escapes.
    return undefined;
  }
}
