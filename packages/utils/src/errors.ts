import type { Delimiters } from "@glion/ast";

/**
 * A character `escapes.write` cannot write: it must be written as an escape
 * sequence, and every escape sequence that writes it holds a delimiter.
 */
export class EscapeSequenceError extends Error {
  override readonly name: string = "EscapeSequenceError";
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

/**
 * A character `escapes.write` cannot write: it must be written as an escape
 * sequence, and the delimiters have no escape character.
 */
export class MissingEscapeCharacterError extends EscapeSequenceError {
  override readonly name: string = "MissingEscapeCharacterError";

  constructor(character: string, delimiters: Delimiters) {
    super(character, delimiters);
    this.message =
      "The value holds a character that must be written as an escape sequence, and the message declares no escape character. MSH-2 declares the escape character as its third encoding character.";
  }
}
