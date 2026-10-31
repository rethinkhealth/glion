// Reads a message into tokens, one `next()` call at a time.
//
// A token is a delimiter, a segment terminator, or a run of text between them,
// with its span in the input. `MSH|^~\&|A^B\rPID|1` reads as:
//
//   TEXT "MSH"        0–3    the Segment ID
//   FIELD_DELIM       3–3    MSH-1 opens; its delimiter takes no characters,
//   TEXT "|"          3–4      because the field separator is MSH-1's value
//   FIELD_DELIM       4–4    MSH-2 opens, also without characters
//   TEXT "^~\&"       4–8    the encoding characters, read as written
//   FIELD_DELIM       8–9
//   TEXT "A"          9–10
//   COMPONENT_DELIM   10–11
//   TEXT "B"          11–12
//   SEGMENT_END "\r"  12–13  the segment terminator, as written
//   TEXT "PID"        13–16  the Segment ID of the next segment
//   FIELD_DELIM       16–17
//   TEXT "1"          17–18
//
// The first five tokens are the message header's, read once by `reset()`
// (`message-header.ts`): the rules below would read MSH-1 as a field delimiter
// and the encoding characters as delimiters. Every other token is read by
// `next()`, which tries these rules at the current offset, in order:
//
//   1. A segment terminator (`segment-terminators.ts`) ends the segment.
//   2. The field delimiter opens a field.
//   3. At the start of a segment, the text up to the first field delimiter or
//      segment terminator is the Segment ID, whatever it holds: `^A|B` opens
//      with the Segment ID `^A`.
//   4. The repetition, component, and subcomponent delimiters.
//   5. Text up to the next delimiter or segment terminator, its escape
//      sequences decoded unless it is part of MSH-2.
//
// Offsets and columns count UTF-16 code units, as `String.prototype.slice`
// does. Each segment terminator starts a new line, whatever characters it
// holds, so `\r\n` counts as one line break.

import type { Delimiters } from "@glion/ast";
import { DEFAULT_DELIMITERS, decodeEscapes } from "@glion/utils";
import type { Position } from "unist";

import {
  MESSAGE_HEADER,
  readEncodingCharacters,
  readMessageHeader,
} from "./message-header";
import { segmentTerminatorAt } from "./segment-terminators";
import type { ParserContext, Token, Tokenizer, TokenType } from "./types";

/** A token of the message header, before `next()` places it. */
interface HeaderToken {
  type: "FIELD_DELIM" | "TEXT";
  value?: string;
}

export interface TokenizerOptions {
  /**
   * Whether a TEXT token holds the characters its escape sequences stand for
   * (`true`, the default) or the escape sequences as they are on the wire
   * (`false`). A Segment ID and the encoding characters MSH-2 declares are
   * never decoded.
   */
  decodeEscapes?: boolean;
}

/**
 * Reads HL7v2 text into tokens: the context `reset()` was last given, or an
 * empty message, which holds none.
 */
export class HL7v2Tokenizer implements Tokenizer, Iterable<Token> {
  private readonly decodeEscapes: boolean;

  // The message being read. `reset()` sets every field below.
  private input = "";
  private delimiters: Delimiters = DEFAULT_DELIMITERS;
  // Stryker disable next-line BooleanLiteral: `next()` reads it only at an offset inside the input, and the empty message has none
  private lineBreaks = true;

  // Where the next token starts.
  private offset = 0;
  private line = 1;
  private column = 1;

  // Whether the next token starts a segment: true at the start of the message
  // and after each segment terminator, false after any other token.
  // Stryker disable next-line BooleanLiteral: `next()` reads it only at an offset inside the input, and the empty message has none
  private atSegmentStart = true;

  // The message header's tokens, and how many of them `next()` has emitted.
  private headerTokens: readonly HeaderToken[] = [];
  private headerTokensEmitted = 0;

  // The offset text is decoded from. MSH-2 is read as written: in
  // `MSH|^~\&\F\|a`, MSH-2 is `^~\&\F\`. So this is the offset MSH-2 ends at,
  // or 0 when the message does not open with a message header segment.
  private decodeFrom = 0;

  constructor(options: TokenizerOptions = {}) {
    this.decodeEscapes = options.decodeEscapes ?? true;
  }

  reset(ctx: ParserContext) {
    this.input = ctx.input;
    this.delimiters = ctx.delimiters;
    this.lineBreaks = ctx.lineBreaks ?? true;
    this.offset = 0;
    this.line = 1;
    this.column = 1;
    this.atSegmentStart = true;
    this.headerTokens = [];
    this.headerTokensEmitted = 0;
    this.decodeFrom = 0;

    const header = readMessageHeader(this.input, this.lineBreaks);
    if (header) {
      // MSH-2 ends where `next()` ends every field: at the field delimiter the
      // context gives, which `detectDelimiters` sets to MSH-1.
      const encodingCharacters = readEncodingCharacters(
        this.input,
        header,
        this.delimiters.field,
        this.lineBreaks
      );
      this.headerTokens = [
        { type: "TEXT", value: MESSAGE_HEADER },
        { type: "FIELD_DELIM" },
        { type: "TEXT", value: header.fieldSeparator },
        { type: "FIELD_DELIM" },
        { type: "TEXT", value: encodingCharacters },
      ];
      // MSH-2 may run past its encoding characters, as `^~\&#` does: the
      // rest is read by `next()` as text, and is not decoded either.
      this.decodeFrom = this.fieldEnd(header.encodingCharactersStart);
    }
  }

  // oxlint-disable-next-line complexity/complexity -- tokenizer hot path: one branch per delimiter class, kept flat for speed
  next(): Token | null {
    const headerToken = this.headerTokens[this.headerTokensEmitted];
    if (headerToken) {
      this.headerTokensEmitted += 1;
      return this.take(
        headerToken.type,
        headerToken.value?.length ?? 0,
        headerToken.value
      );
    }

    const { input, offset } = this;
    if (offset >= input.length) {
      return null;
    }

    // 1. A segment terminator.
    const terminator = segmentTerminatorAt(input, offset, this.lineBreaks);
    if (terminator !== undefined) {
      return this.takeSegmentTerminator(terminator);
    }

    // 2. The field delimiter.
    const { component, field, repetition, subcomponent } = this.delimiters;
    const char = input.charAt(offset);
    if (char === field) {
      return this.take("FIELD_DELIM", 1);
    }

    // 3. A Segment ID runs to the first field delimiter and holds no other
    // delimiters or escape sequences (HL7v2 §2.5.2, §2.7): a line `^A|B` opens
    // with the Segment ID `^A`, and `Z\R\Z|B` with `Z\R\Z`.
    if (this.atSegmentStart) {
      const segmentId = input.slice(offset, this.fieldEnd(offset));
      return this.take("TEXT", segmentId.length, segmentId);
    }

    // 4. The repetition, component, and subcomponent delimiters.
    if (char === repetition) {
      return this.take("REPETITION_DELIM", 1);
    }
    if (char === component) {
      return this.take("COMPONENT_DELIM", 1);
    }
    if (char === subcomponent) {
      return this.take("SUBCOMP_DELIM", 1);
    }

    // 5. Text up to the next delimiter or segment terminator.
    const { lineBreaks } = this;
    let end = offset;
    // Stryker disable next-line EqualityOperator: at the end of the input, `charAt` reads "", which is no delimiter, so one more step changes nothing
    while (end < input.length) {
      const c = input.charAt(end);
      if (
        c === field ||
        c === repetition ||
        c === component ||
        c === subcomponent ||
        segmentTerminatorAt(input, end, lineBreaks) !== undefined
      ) {
        break;
      }
      end += 1;
    }
    // The token spans the text as written; its value may be shorter.
    const text = input.slice(offset, end);
    const value =
      // Stryker disable next-line EqualityOperator: no TEXT token starts at decodeFrom, which is a field delimiter, a segment terminator, or the end of the input
      this.decodeEscapes && offset >= this.decodeFrom
        ? decodeEscapes(text, this.delimiters)
        : text;
    return this.take("TEXT", text.length, value);
  }

  *[Symbol.iterator](): Iterator<Token> {
    for (let token = this.next(); token; token = this.next()) {
      yield token;
    }
  }

  // The offset of the first field delimiter or segment terminator at or after
  // `from`, or the end of the input.
  private fieldEnd(from: number): number {
    const { input, lineBreaks } = this;
    const { field } = this.delimiters;
    let end = from;
    while (
      // Stryker disable next-line EqualityOperator: at the end of the input, `charAt` reads "", which is no delimiter, so one more step changes nothing
      end < input.length &&
      input.charAt(end) !== field &&
      segmentTerminatorAt(input, end, lineBreaks) === undefined
    ) {
      end += 1;
    }
    return end;
  }

  // The token of `type` over the next `length` characters, all on the
  // current line. Moves past them, inside the segment.
  private take(type: TokenType, length: number, value?: string): Token {
    const start = this.point();
    this.offset += length;
    this.column += length;
    this.atSegmentStart = false;
    return this.token(type, value, start);
  }

  // The SEGMENT_END token over `terminator`, which is its value. Moves past it, to the start of
  // the next line and the next segment.
  private takeSegmentTerminator(terminator: string): Token {
    const start = this.point();
    this.offset += terminator.length;
    this.line += 1;
    this.column = 1;
    this.atSegmentStart = true;
    return this.token("SEGMENT_END", terminator, start);
  }

  private point(): Position["start"] {
    return { column: this.column, line: this.line, offset: this.offset };
  }

  private token(
    type: TokenType,
    value: string | undefined,
    start: Position["start"]
  ): Token {
    return { position: { end: this.point(), start }, type, value };
  }
}
