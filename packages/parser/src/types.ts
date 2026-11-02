import type { Delimiters, Root } from "@glion/ast";
import type { Processor } from "unified";
import type { Position } from "unist";

/**
 * A unified `Processor` that parses HL7v2 messages into `Root` trees.
 *
 * Only `ParseTree` is constrained — head and tail admit `undefined` so that
 * any processor built with `unified().use(hl7v2Parser)` is assignable, from
 * the bare parser (whose transform head/tail are `undefined`) through full
 * transformer/compiler pipelines like `@glion/hl7v2`'s `parseHL7v2`.
 */
export type Hl7v2Processor = Processor<
  Root,
  Root | undefined,
  Root | undefined
>;

/**
 * A preprocessing step: reads the context before the input is tokenized, and
 * returns the context to tokenize.
 */
export type PreprocessorStep = (ctx: ParserContext) => ParserContext;

/**
 * The delimiters to read a message with where its MSH-2 declares none. A
 * delimiter MSH-2 declares is read as declared. MSH-2 is positional: each is
 * filled in order, up to the first that is not given. MSH-2 in the tree holds
 * what is filled.
 */
export type EncodingCharacters = Partial<Omit<Delimiters, "field">>;

export interface ParseOptions {
  /**
   * The delimiters to read with where MSH-2 declares none. Each is one
   * character, and not a line break.
   */
  encodingCharacters?: EncodingCharacters | undefined;
  /**
   * Whether a subcomponent value holds the separators and control characters
   * their escape sequences stand for, as `escapes.read` from `@glion/utils`
   * reads them (`true`, the default), or every escape sequence as it is on
   * the wire (`false`).
   */
  decodeEscapes?: boolean;
  /**
   * Whether a line feed, or a carriage return and a line feed, also ends a
   * segment (`true`, the default), or only a carriage return does (`false`), as
   * HL7v2 Chapter 2 requires. With `false`, a line feed is data.
   */
  lineBreaks?: boolean;
  /**
   * The preprocessing steps to run in place of `defaultPreprocessors`. A step
   * that rewrites `input` moves every position into the rewritten text.
   */
  preprocess?: PreprocessorStep[];
}

/** What the tokenizer reads: the input and its delimiters. */
export interface ParserContext {
  /** The message as given. */
  input: string;
  /** The delimiters the tokenizer splits `input` at. */
  delimiters: Delimiters;
  /** The value of MSH-2, when it is not the text as written. */
  encodingCharacters?: string | undefined;
  /**
   * Whether a line feed, or a carriage return and a line feed, also ends a
   * segment. Absent means `true`.
   */
  lineBreaks?: boolean | undefined;
  metadata?: Record<string, unknown>;
}

/** A delimiter, a segment terminator, or a run of text, and its span. */
export interface Token {
  type: TokenType;
  /**
   * A TEXT token's text: a Segment ID, MSH-1, the encoding characters, or a
   * value, its escape sequences decoded unless they are kept. A SEGMENT_END
   * token's segment terminator, as written. Absent on every other token.
   */
  value?: string;
  /**
   * The token's span in the input. A decoded value may be shorter than its
   * span, and the delimiters before MSH-1 and MSH-2 span no characters.
   */
  position: Position;
}

/**
 * The kind of a token: a segment terminator (`SEGMENT_END`), a field,
 * repetition, component, or subcomponent separators, or a run of text (`TEXT`).
 */
export type TokenType =
  | "SEGMENT_END"
  | "FIELD_SEPARATOR"
  | "REPETITION_SEPARATOR"
  | "COMPONENT_SEPARATOR"
  | "SUBCOMPONENT_SEPARATOR"
  | "TEXT";

/** Reads tokens from a context, one at a time. */
export interface Tokenizer {
  /** Starts reading `ctx.input` from its beginning. */
  reset(ctx: ParserContext): void;
  /** The next token, or `null` after the last one. */
  next(): Token | null;
}
