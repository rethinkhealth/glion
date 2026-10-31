import type { Delimiters } from "@glion/ast";

// The table decodeEscapes and encodeEscapes share. It holds the characters a
// value cannot carry as they are, each with the one escape code that writes
// it. With the usual delimiters `|^~\&`:
//
//   |  ↔  F        ^  ↔  S        ~  ↔  R        &  ↔  T
//   a carriage return  ↔  X0D     a line feed  ↔  X0A
//   any other character below U+0020  ↔  Xdd
//
// A separator whose named code holds a delimiter takes the hexadecimal code
// of its UTF-8 bytes instead: with `E` as the field separator, `~` ↔ `X7e`.
// The escape character is not in the table, so `\E\` is never decoded.

const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
const HEX_CODE = /^X(?:[0-9A-Fa-f]{2})+$/;
const SPACE = " ";
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const UTF8_ENCODER = new TextEncoder();

/**
 * Whether `ch` is a character of the table: a field, component, repetition,
 * or subcomponent separator, or a character below U+0020 that is not the
 * escape character.
 */
export function isTableCharacter(ch: string, d: Delimiters): boolean {
  return (
    ch === d.field ||
    ch === d.component ||
    ch === d.repetition ||
    ch === d.subcomponent ||
    (ch.length === 1 && ch < SPACE && ch !== d.escape)
  );
}

/**
 * The escape code that writes `ch`, or `undefined` when every code for it
 * holds a delimiter.
 *
 * The named code (`F`, `S`, `R`, `T`, or `E` for the escape character) when
 * it holds no delimiter, and otherwise the hexadecimal code of the UTF-8
 * bytes of `ch`, with a digit `A`–`F` in lowercase when its uppercase form is
 * a delimiter.
 */
export function escapeCode(ch: string, d: Delimiters): string | undefined {
  const named = namedCode(ch, d);
  if (named !== undefined && !holdsDelimiter(named, d)) {
    return named;
  }
  return hexCode(ch, d);
}

/**
 * The table character the escape code `code` writes, or `undefined` when
 * `code` is not the code {@link escapeCode} gives a table character.
 */
export function tableCharacter(
  code: string,
  d: Delimiters
): string | undefined {
  const ch = namedCharacter(code, d) ?? hexCharacter(code);
  if (ch === undefined || !isTableCharacter(ch, d)) {
    return undefined;
  }
  return escapeCode(ch, d) === code ? ch : undefined;
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
    case d.escape: {
      return "E";
    }
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
    // Bytes that are not UTF-8 name no character of the table.
    return undefined;
  }
}
