import type { Delimiters } from "@glion/ast";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import fc from "fast-check";

// Text built from the pieces where the tokenizer's rules meet: the message
// header and its byte order mark, every delimiter, each segment terminator,
// escape sequences that decode to a delimiter or a line break, characters
// that are delimiters in the other delimiter sets below, and a character two
// UTF-16 code units long.
const pieces = [
  "MSH",
  "MSH|^~\\&",
  "MSH*%$#&",
  "PID",
  "A",
  "|",
  "^",
  "~",
  "&",
  "\\",
  "\r",
  "\n",
  "\r\n",
  "\uFEFF",
  "\\F\\",
  "\\.br\\",
  "\\X0A\\",
  "*",
  "%",
  "$",
  "#",
  "\u{1F600}",
] as const;

/** Text of up to 24 pieces where the tokenizer's rules meet. */
export const arbText: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...pieces), { maxLength: 24 })
  .map((parts) => parts.join(""));

/**
 * The default delimiters, and delimiter sets whose segment delimiter is another
 * character, a line feed, or a delimiter MSH-2 also declares. Every delimiter
 * is one character, as HL7v2 requires.
 */
export const arbDelimiters: fc.Arbitrary<Delimiters> = fc.constantFrom(
  DEFAULT_DELIMITERS,
  { ...DEFAULT_DELIMITERS, segment: "$" },
  { ...DEFAULT_DELIMITERS, segment: "\n" },
  { ...DEFAULT_DELIMITERS, segment: "^" },
  { ...DEFAULT_DELIMITERS, field: "*", segment: "#" }
);
