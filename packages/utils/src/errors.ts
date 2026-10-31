import type { Delimiters } from "@glion/ast";

/**
 * A character {@link encodeEscapes} or {@link escapeText} cannot write: it must
 * be written as an escape sequence, and every escape sequence that writes it
 * holds a delimiter.
 */
export class EscapeSequenceError extends Error {
  override readonly name = "EscapeSequenceError";
  /** The character that cannot be written. */
  readonly character: string;
  /** The delimiters it was written with. */
  readonly delimiters: Delimiters;

  constructor(character: string, delimiters: Delimiters) {
    super(
      "The value holds a character that must be written as an escape sequence, and every escape sequence for it holds one of the message's delimiters. With delimiters that are ASCII punctuation, every character can be written."
    );
    this.character = character;
    this.delimiters = delimiters;
  }
}
