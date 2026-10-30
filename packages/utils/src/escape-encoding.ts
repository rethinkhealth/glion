import type { Delimiters } from "@glion/ast";

import { SEGMENT_TERMINATOR } from "./constants";
import { EscapeSequenceError } from "./errors";

const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
// A formatting command (`\H\`, `\N\`, `\.sp 2\`, but not `\.br\`), a locally
// defined sequence (`\Z…\`), or a character set switch (`\Cxxyy\`,
// `\Mxxyyzz\`): HL7v2 §2.7 sequences that are kept as they are written.
const VERBATIM_SEQUENCE =
  /^(?:H|N|\.(?!br)[a-z]{2} ?[+-]?\d*|Z\P{Cc}*|C[0-9A-Fa-f]{4}|M[0-9A-Fa-f]{4}(?:[0-9A-Fa-f]{2})?)$/u;
const SPACE = " ";
const UTF8_ENCODER = new TextEncoder();

// encodeEscapes writes the reverse of decodeEscapes. For each character it
// asks escapeSequence, which tries namedEscapeCode and then hexEscapeCode and
// keeps the first form holdsDelimiter accepts. The output never holds a
// delimiter, because the parser splits a field at its delimiters before it
// decodes escape sequences:
//
//   SMITH&JONES  →  SMITH\T\JONES    with `|^~\&`
//   a<b          →  a<X3C<b          with `E` as the component separator and
//                                    `<` as the escape character: `<E<`
//                                    would hold `E`

/**
 * The value `value` takes on the wire, with every character that cannot
 * appear in a value written as an HL7v2 escape sequence.
 *
 * Writes the field, component, repetition, subcomponent, and escape
 * delimiters as `\F\`, `\S\`, `\R\`, `\T\`, and `\E\`, the segment terminator
 * as `\.br\`, and any other character below U+0020 as `\Xdd\`. A character
 * whose escape code holds a delimiter, such as `\E\` when `E` is the
 * component separator, is written as `\Xdd\`, the hexadecimal escape of its
 * UTF-8 bytes, with a digit `A`–`F` in lowercase when its uppercase form is a
 * delimiter. A
 * formatting command (`\H\`, `\N\`, `\.sp 2\`, `\.in+4\`, …), a locally
 * defined sequence (`\Z…\`), and a character set switch (`\Cxxyy\`,
 * `\Mxxyyzz\`) are written as they are.
 *
 * The encoded value holds no field, component, repetition, or subcomponent
 * delimiter, and no segment terminator, and `decodeEscapes(encodeEscapes(value,
 * d), d)` is `value`.
 *
 * @param value - The value to write.
 * @param d - The delimiters of the message.
 * @returns The encoded value.
 * @throws {EscapeSequenceError} When a character must be escaped and every
 *   escape sequence that writes it holds a delimiter.
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

  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);

    // A formatting command, `\Z…\`, or character set switch already in the
    // value is markup, not data: jump past it so it is copied as written.
    const verbatimEnd = ch === d.escape ? verbatimSequenceEnd(value, i, d) : -1;
    if (verbatimEnd !== -1) {
      i = verbatimEnd;
      continue;
    }

    const sequence = escapeSequence(ch, d);
    if (sequence !== undefined) {
      encoded += value.slice(copied, i) + sequence;
      copied = i + 1;
    }
  }

  return encoded + value.slice(copied);
}

/**
 * Whether `value` holds a delimiter, the escape character, or a character below
 * U+0020.
 */
function needsEncoding(value: string, d: Delimiters): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charAt(i);
    if (
      ch === d.field ||
      ch === d.component ||
      ch === d.repetition ||
      ch === d.subcomponent ||
      ch === d.escape ||
      ch < SPACE
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The index of the escape character that closes the formatting command,
 * locally defined sequence, or character set switch starting at `index`, or
 * `-1` when none starts there.
 */
function verbatimSequenceEnd(
  value: string,
  index: number,
  d: Delimiters
): number {
  const end = value.indexOf(d.escape, index + 1);
  if (end === -1) {
    return -1;
  }
  // Kept only when the text between the escape characters is a sequence HL7v2
  // defines and holds no delimiter. In `\Zfoo|bar\`, the `|` is data, so the
  // whole run is escaped character by character instead.
  const code = value.slice(index + 1, end);
  return VERBATIM_SEQUENCE.test(code) && !holdsDelimiter(code, d) ? end : -1;
}

/**
 * The escape sequence that writes `ch`, or `undefined` when `ch` is written as
 * it is.
 *
 * Writes the escape code HL7v2 names for `ch` when it holds no delimiter, and
 * otherwise the hexadecimal escape of `ch`.
 *
 * @throws {EscapeSequenceError} When both hold a delimiter.
 */
function escapeSequence(ch: string, d: Delimiters): string | undefined {
  // 1. Not a delimiter, the escape character, or a control character: it is
  //    written as it is.
  const named = namedEscapeCode(ch, d);
  if (named === undefined && ch >= SPACE) {
    return undefined;
  }

  // 2. The named code, when it holds no delimiter: `&` → `\T\`.
  if (named !== undefined && !holdsDelimiter(named, d)) {
    return d.escape + named + d.escape;
  }

  // 3. The hexadecimal escape: `<` → `<X3C<` when `E` is a delimiter, and a
  //    control character, which has no named code: a line feed → `\X0A\`.
  const hex = hexEscapeCode(ch, d);
  if (hex !== undefined) {
    return d.escape + hex + d.escape;
  }

  // 4. Neither works. With `X` and `S` both delimiters, `S` cannot be
  //    written: `\S\` holds `S`, and every `\X53\` holds `X`.
  throw new EscapeSequenceError(ch, d);
}

/**
 * The escape code HL7v2 names for `ch` when it is a delimiter or the escape
 * character, or `undefined`.
 */
function namedEscapeCode(ch: string, d: Delimiters): string | undefined {
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
    case SEGMENT_TERMINATOR: {
      return ".br";
    }
    default: {
      return undefined;
    }
  }
}

/**
 * The hexadecimal escape code (`Xdd…`) of the UTF-8 bytes of `ch` that holds
 * no delimiter, or `undefined` when there is none.
 *
 * Writes each digit `A`–`F` in uppercase, or in lowercase when its uppercase
 * form is a delimiter. A lone surrogate has no UTF-8 bytes, so it has none.
 */
function hexEscapeCode(ch: string, d: Delimiters): string | undefined {
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
