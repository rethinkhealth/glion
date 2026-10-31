import type { Delimiters } from "@glion/ast";

import { tableCharacter } from "./escape-table";

// decodeEscapes reads a value left to right. Plain characters are copied as
// they are. At an escape character it looks for the closing one, and the text
// between the two (the escape code) decides what is written. With the usual
// delimiters `|^~\&`:
//
//   SMITH\T\JONES   →  SMITH&JONES     a code of the table, its character
//   a\X0D\b         →  a␍b             a code of the table, its character
//   Smith\E\Jones   →  Smith\E\Jones   any other code, kept as written
//   1\.br\2         →  1\.br\2         any other code, kept as written
//   a\b             →  a\b             no closing escape character, kept

/**
 * The value `value` holds once the escape sequences that stand for a
 * separator or a control character are decoded.
 *
 * Decodes `\F\`, `\S\`, `\R\`, and `\T\` to the separator each stands for,
 * and `\Xdd\` to the character below U+0020 it names. A separator whose named
 * code holds a delimiter is decoded from the hexadecimal escape
 * {@link encodeEscapes} writes for it. Leaves every other escape sequence as
 * it is written: `\E\`, `\P\`, `\H\`, `\N\`, a formatting command such as
 * `\.br\`, any other `\X…\`, `\Z…\`, `\C…\`, `\M…\`, an unknown code, and an
 * escape character without a closing one.
 *
 * Idempotent: a decoded character is never the escape character.
 *
 * @param value - The value as it is on the wire.
 * @param d - The delimiters of the message.
 * @returns The decoded value.
 */
export function decodeEscapes(value: string, d: Delimiters): string {
  // Stryker disable next-line ConditionalExpression, BlockStatement: a value without the escape character decodes to itself through the loop as well; the return skips the loop
  if (!value.includes(d.escape)) {
    return value;
  }

  let decoded = "";
  let i = 0;

  while (i < value.length) {
    if (value[i] !== d.escape) {
      decoded += value[i];
      i += 1;
      continue;
    }

    const end = value.indexOf(d.escape, i + 1);
    if (end === -1) {
      decoded += value.slice(i);
      break;
    }

    // The escape code is the text between the two, such as `T` in `\T\`.
    const code = value.slice(i + 1, end);
    decoded += tableCharacter(code, d) ?? value.slice(i, end + 1);
    i = end + 1;
  }

  return decoded;
}
