import type { Delimiters } from "@glion/ast";

import { SEGMENT_TERMINATOR } from "./constants";

const HEX_RADIX = 16;
const HEX_PAIR_LENGTH = 2;
const HEX_PAIRS = /^(?:[0-9a-f]{2})+$/i;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

// decodeEscapes reads a value left to right. Plain characters are copied as
// they are. At an escape character it looks for the closing one, and the text
// between the two (the escape code) decides what is written. With the usual
// delimiters `|^~\&`:
//
//   SMITH\T\JONES  →  SMITH&JONES   named code, the switch in decodeEscapes
//   caf\XC3A9\     →  café          hex code, decodeOtherSequence
//   \H\BOLD\N\     →  \H\BOLD\N\    formatting command, kept as written
//   a\b            →  a\b           no closing escape character, kept

/**
 * The value `value` carries once its HL7v2 escape sequences are decoded.
 *
 * Decodes `\F\`, `\S\`, `\R\`, `\T\`, and `\E\` to the delimiter each stands
 * for, `\.br\` to the segment terminator, and `\Xdd…\` to the characters its
 * bytes, named by pairs of hexadecimal digits, encode in UTF-8. Leaves a
 * formatting command (`\H\`, `\N\`, `\.sp\`, …), a locally defined sequence
 * (`\Z…\`), a character set switch (`\Cxxyy\`, `\Mxxyyzz\`), any other
 * sequence, an `\X…\` whose content is not pairs of hexadecimal digits or
 * whose bytes are not UTF-8, and an escape character without a closing one,
 * as it is.
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
      // No closing escape character: the rest of the value is data.
      decoded += value.slice(i);
      break;
    }

    // The escape code is the text between the two, such as `T` in `\T\`.
    const code = value.slice(i + 1, end);
    switch (code) {
      case "F": {
        decoded += d.field;
        break;
      }
      case "S": {
        decoded += d.component;
        break;
      }
      case "R": {
        decoded += d.repetition;
        break;
      }
      case "T": {
        decoded += d.subcomponent;
        break;
      }
      case "E": {
        decoded += d.escape;
        break;
      }
      case ".br": {
        decoded += SEGMENT_TERMINATOR;
        break;
      }
      default: {
        decoded += decodeOtherSequence(code, d);
        break;
      }
    }
    i = end + 1;
  }

  return decoded;
}

/**
 * The characters an `\Xdd…\` with escape code `code` stands for, or the
 * sequence `code` names written as it is.
 */
function decodeOtherSequence(code: string, d: Delimiters): string {
  // `X` followed by hexadecimal digits in pairs, one byte per pair.
  if (code.startsWith("X") && HEX_PAIRS.test(code.slice(1))) {
    const characters = decodeHexDigits(code.slice(1));
    if (characters !== undefined) {
      return characters;
    }
  }
  // Anything else (a formatting command, `\Z…\`, a character set switch, an
  // unknown code, or hex digits that are not UTF-8) is put back as written.
  return d.escape + code + d.escape;
}

/**
 * The characters the bytes `hex` names encode in UTF-8, or `undefined` when
 * they are not UTF-8.
 */
function decodeHexDigits(hex: string): string | undefined {
  // `C3A9` → bytes 0xC3 0xA9 → `é`.
  const bytes = new Uint8Array(hex.length / HEX_PAIR_LENGTH);
  for (let i = 0; i < bytes.length; i += 1) {
    const pair = hex.slice(i * HEX_PAIR_LENGTH, (i + 1) * HEX_PAIR_LENGTH);
    bytes[i] = Number.parseInt(pair, HEX_RADIX);
  }
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    // The message is UTF-8 (#659); bytes that are not stay as the sender wrote them.
    return undefined;
  }
}
