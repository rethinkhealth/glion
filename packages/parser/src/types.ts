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

export interface ParseOptions {
  /**
   * Whether a subcomponent value holds the characters its escape sequences
   * stand for (`true`, the default) or the escape sequences as they are on
   * the wire (`false`).
   */
  decodeEscapes?: boolean;
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
  metadata?: Record<string, unknown>;
}

/** A delimiter, a segment terminator, or a run of text, and its span. */
export interface Token {
  type: TokenType;
  /**
   * A TEXT token's text: a Segment ID, MSH-1, the encoding characters, or a
   * value, its escape sequences decoded unless they are kept. Absent on every
   * other token.
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
 * repetition, component, or subcomponent delimiter, or a run of text (`TEXT`).
 */
export type TokenType =
  | "SEGMENT_END"
  | "FIELD_DELIM"
  | "REPETITION_DELIM"
  | "COMPONENT_DELIM"
  | "SUBCOMP_DELIM"
  | "TEXT";

/** Reads tokens from a context, one at a time. */
export interface Tokenizer {
  /** Starts reading `ctx.input` from its beginning. */
  reset(ctx: ParserContext): void;
  /** The next token, or `null` after the last one. */
  next(): Token | null;
}
