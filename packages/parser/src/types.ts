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

// Forward declaration to avoid circular import at runtime
// Consumers provide functions with compatible signature from `preprocessor.ts`
export type PreprocessorStep = (ctx: ParserContext) => ParserContext;

export interface ParseOptions {
  /**
   * Optional preprocessing steps to apply to the input before parsing.
   */
  preprocess?: PreprocessorStep[];
}

export interface ParserContext {
  input: string;
  delimiters: Delimiters;
  metadata?: Record<string, unknown>;
}

// ---- Tokens (minimal) ----
export interface Token {
  type: TokenType;
  value?: string; // TEXT or 3-char seg name
  position: Position;
}

// ---- Tokenizer interface ----
export type TokenType =
  | "SEGMENT_END"
  | "FIELD_DELIM"
  | "REPETITION_DELIM"
  | "COMPONENT_DELIM"
  | "SUBCOMP_DELIM"
  | "TEXT";

export interface Tokenizer {
  reset(ctx: ParserContext): void;
  next(): Token | null;
}
