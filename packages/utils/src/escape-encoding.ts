import type { Delimiters } from "@glion/ast";

import { EscapeSequenceError } from "./errors";
import { escapeCode, isTableCharacter } from "./escape-table";

// encodeEscapes writes the reverse of decodeEscapes. Each separator and
// control character is written as its code from the table. An escape
// character and the next one enclose a sequence that is copied as written,
// unless the text between them holds a character of the table; then both are
// data, written as `\E\`, as is an escape character without a closing one.
// With the usual delimiters `|^~\&`:
//
//   SMITH&JONES   →  SMITH\T\JONES
//   1\.br\2       →  1\.br\2           a sequence, copied
//   a\b|c         →  a\E\b\F\c         no closing escape character
//   \Zfoo|bar\    →  \E\Zfoo\F\bar\E\  `|` inside: neither is a sequence

/**
 * The value `value` takes on the wire.
 *
 * Writes the field, component, repetition, and subcomponent separators as
 * `\F\`, `\S\`, `\R\`, and `\T\`, and any other character below U+0020 as
 * `\Xdd\`. A character whose escape code holds a delimiter, such as `|` when
 * `F` is the component separator, is written as `\Xdd\`, the hexadecimal
 * escape of its UTF-8 bytes, with a digit `A`–`F` in lowercase when its
 * uppercase form is a delimiter. Two escape characters in a row and the text
 * between them are written as they are, as an escape sequence, when that text
 * holds no separator and no character below U+0020; otherwise both are data.
 * An escape character that is data, or that has no closing one, is written
 * as `\E\`, or as its hexadecimal escape when `E` is a delimiter.
 *
 * The encoded value holds no field, component, repetition, or subcomponent
 * separator, no character below U+0020, and no escape character outside a
 * closed escape sequence. Idempotent. For every value `w` on the wire that
 * holds no character below U+0020 and in which each escape character has a
 * closing one, `encodeEscapes(decodeEscapes(w, d), d)` is `w`.
 *
 * @param value - The value to write.
 * @param d - The delimiters of the message.
 * @returns The encoded value.
 * @throws {EscapeSequenceError} When a character must be escaped and every
 *   escape code that writes it holds a delimiter.
 */
export function encodeEscapes(value: string, d: Delimiters): string {
  if (!needsEncoding(value, d)) {
    return value;
  }

  // Plain characters are not appended one at a time. `copied` marks where the
  // run of plain characters not yet written starts; the run is copied in one
  // slice when an escape sequence follows it, or at the end.
  let encoded = "";
  let copied = 0;

  // The escape character that closes a pair holding a character of the table:
  // data, like the one that opened the pair.
  let closingData = -1;

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);

    if (ch === d.escape && i !== closingData) {
      const end = value.indexOf(d.escape, i + 1);
      if (end !== -1 && !holdsTableCharacter(value, i + 1, end, d)) {
        i = end;
        continue;
      }
      closingData = end;
    } else if (ch !== d.escape && !isTableCharacter(ch, d)) {
      continue;
    }

    encoded += value.slice(copied, i) + escapeSequence(ch, d);
    copied = i + 1;
  }

  return encoded + value.slice(copied);
}

/**
 * Free text `text` as a value: each escape character written as `\E\`, or as
 * its hexadecimal escape when `E` is a delimiter, so that
 * {@link encodeEscapes} writes it as data.
 *
 * @param text - The text to hold in a value.
 * @param d - The delimiters of the message.
 * @returns The value.
 * @throws {EscapeSequenceError} When `text` holds the escape character and
 *   every escape code that writes it holds a delimiter.
 */
export function escapeText(text: string, d: Delimiters): string {
  if (!text.includes(d.escape)) {
    return text;
  }
  return text.replaceAll(d.escape, escapeSequence(d.escape, d));
}

/**
 * Whether `value` holds the escape character or a character of the table.
 */
function needsEncoding(value: string, d: Delimiters): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    if (ch === d.escape || isTableCharacter(ch, d)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether `value` holds a character of the table from `from` up to `to`.
 */
function holdsTableCharacter(
  value: string,
  from: number,
  to: number,
  d: Delimiters
): boolean {
  for (let i = from; i < to; i += 1) {
    if (isTableCharacter(value.charAt(i), d)) {
      return true;
    }
  }
  return false;
}

/**
 * The escape sequence that writes `ch`.
 *
 * @throws {EscapeSequenceError} When every escape code for `ch` holds a
 *   delimiter.
 */
function escapeSequence(ch: string, d: Delimiters): string {
  const code = escapeCode(ch, d);
  if (code === undefined) {
    // With `X` and `S` both delimiters, `S` cannot be written: `\S\` holds
    // `S`, and every `\X53\` holds `X`.
    throw new EscapeSequenceError(ch, d);
  }
  return d.escape + code + d.escape;
}
