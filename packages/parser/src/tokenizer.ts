// src/tokenizer.ts
import type { Delimiters } from "@glion/ast";
import { decodeEscapes, SEGMENT_TERMINATOR } from "@glion/utils";
import type { Position } from "unist";

import type { ParserContext, Token, Tokenizer, TokenType } from "./types";

const MSH_SEGMENT_START = 0;
const MSH_SEGMENT_END = 3;
const MSH_FIELD_SEPERATOR_START = 3;
const MSH_FIELD_SEPERATOR_END = 4;
const MSH_FIELD_DELIMITER_START = 4;
const MSH_FIELD_DELIMITER_END = 8;
const BYTE_ORDER_MARK = "\uFEFF";
const LINE_FEED = "\n";
const CARRIAGE_RETURN = "\r";

/**
 * The offset the message starts at in `input`: 1 after a byte order mark,
 * which is not part of the message, and 0 otherwise.
 */
export const messageStart = (input: string): number =>
  input.startsWith(BYTE_ORDER_MARK) ? 1 : 0;

export interface TokenizerOptions {
  /**
   * Whether a TEXT token holds the characters its escape sequences stand for
   * (`true`, the default) or the escape sequences as they are on the wire
   * (`false`). A Segment ID and the encoding characters MSH-2 declares are
   * never decoded.
   */
  decodeEscapes?: boolean;
}

export class HL7v2Tokenizer implements Tokenizer, Iterable<Token> {
  private readonly decodeEscapes: boolean;
  private input = "";
  private start = 0;
  private i = 0;
  private line = 1;
  private col = 1;
  private delims!: Delimiters;

  // Only-run-once MSH bootstrap at the start of the file
  private didMshBootstrap = false;
  private pendingBootstrap: null | Array<
    | { kind: "TEXT"; value: string; advance: number }
    | { kind: "FIELD_DELIM"; advance: number }
  > = null; // queue to emit TEXT('MSH'), FIELD_DELIM, TEXT('^~\\&')
  // MSH-2 holds the encoding characters, which are never escape sequences: in
  // `MSH|^~\&\F\|a`, MSH-2 is `^~\&\F\`, read as it is written. The offset of
  // the first field delimiter after MSH-2 starts, or 0 when the input does not
  // start with MSH. Text up to it is MSH-2, or a Segment ID that is never
  // decoded either.
  private msh2End = 0;

  constructor(options: TokenizerOptions = {}) {
    this.decodeEscapes = options.decodeEscapes ?? true;
  }

  reset(ctx: ParserContext) {
    this.input = ctx.input;
    this.delims = ctx.delimiters;
    this.start = messageStart(this.input);
    this.i = this.start;
    this.line = 1;
    this.col = 1 + this.start;
    this.didMshBootstrap = false;
    this.pendingBootstrap = null;
    this.msh2End = 0;

    // Prepare a one-time bootstrap if file starts with MSH
    if (this.input.startsWith("MSH", this.start)) {
      // Precompute MSH and MSH.2; MSH.1 is the field delimiter char at index 3
      const msh = this._slice(MSH_SEGMENT_START, MSH_SEGMENT_END);
      const msh1 = this._slice(
        MSH_FIELD_SEPERATOR_START,
        MSH_FIELD_SEPERATOR_END
      ); // the field delimiter char at index 3
      const msh2 = this._slice(
        MSH_FIELD_DELIMITER_START,
        MSH_FIELD_DELIMITER_END
      ); // may be shorter than 4 if truncated
      this.pendingBootstrap = [
        { advance: msh.length, kind: "TEXT", value: msh },
        { advance: 0, kind: "FIELD_DELIM" },
        { advance: msh1.length, kind: "TEXT", value: msh1 },
        { advance: 0, kind: "FIELD_DELIM" },
        { advance: msh2.length, kind: "TEXT", value: msh2 },
      ];
      // NOTE: we have not advanced indices yet; we will as we emit tokens
      this.msh2End = Math.min(
        this.start + MSH_FIELD_DELIMITER_END,
        this.input.length
      );
      let c = this.input.charAt(this.msh2End);
      while (c !== "" && c !== this.delims.field) {
        this.msh2End += 1;
        c = this.input.charAt(this.msh2End);
      }
    }
  }

  // oxlint-disable-next-line complexity/complexity -- tokenizer hot path: one branch per delimiter class, kept flat for speed
  next(): Token | null {
    const s = this.input;
    const n = s.length;
    if (this.i >= n && !this.pendingBootstrap?.length) {
      return null;
    }

    const start = { column: this.col, line: this.line, offset: this.i };

    // ---- One-time MSH bootstrap at file start ----
    if (!this.didMshBootstrap && this.pendingBootstrap) {
      const step = this.pendingBootstrap.shift();
      if (step) {
        if (step.kind === "TEXT") {
          const take = Math.min(step.advance, n - this.i);
          const out = step.value.slice(0, take);
          this._advanceThrough(out);
          if (this.pendingBootstrap.length === 0) {
            this.pendingBootstrap = null;
            this.didMshBootstrap = true;
          }
          return this._tok("TEXT", out, start);
        }
        // FIELD_DELIM: advance exactly one char (the delimiter) and emit a FIELD_DELIM token
        this._advance(Math.min(step.advance, n - this.i));
        if (this.pendingBootstrap.length === 0) {
          this.pendingBootstrap = null;
          this.didMshBootstrap = true;
        }
        return this._tok("FIELD_DELIM", undefined, start);
      }
    }

    // ---- Normal tokenization (delimiters + text) ----
    if (this.i >= n) {
      return null;
    }
    const ch = s.charAt(this.i);

    const lineBreak = this._lineBreakAt(this.i);
    if (lineBreak > 0) {
      this._advance(lineBreak, true);
      return this._tok("SEGMENT_END", undefined, start);
    }
    if (ch === this.delims.field) {
      this._advance(1);
      return this._tok("FIELD_DELIM", undefined, start);
    }
    // A Segment ID runs to the first field delimiter and holds no other
    // delimiters or escape sequences (HL7v2 §2.5.2, §2.7): a line `^A|B` opens
    // with the Segment ID `^A`, and `Z\R\Z|B` with `Z\R\Z`.
    const previous = s.charAt(this.i - 1);
    if (
      this.i === this.start ||
      previous === this.delims.segment ||
      previous === LINE_FEED
    ) {
      // The first character is neither delimiter: both were checked above.
      let j = this.i + 1;
      let c = s.charAt(j);
      while (c !== "" && c !== this.delims.field && !this._lineBreakAt(j)) {
        j += 1;
        c = s.charAt(j);
      }
      const segmentId = s.slice(this.i, j);
      this._fastAdvance(segmentId);
      return this._tok("TEXT", segmentId, start);
    }
    if (ch === this.delims.repetition) {
      this._advance(1);
      return this._tok("REPETITION_DELIM", undefined, start);
    }
    if (ch === this.delims.component) {
      this._advance(1);
      return this._tok("COMPONENT_DELIM", undefined, start);
    }
    if (ch === this.delims.subcomponent) {
      this._advance(1);
      return this._tok("SUBCOMP_DELIM", undefined, start);
    }

    // TEXT until next delimiter or end
    let j = this.i;
    const cmp = this.delims.component,
      esc = this.delims.escape,
      fld = this.delims.field,
      rep = this.delims.repetition,
      sub = this.delims.subcomponent;
    let escaped = false;

    while (j < s.length) {
      const c = s.charAt(j);
      if (
        c === seg ||
        c === fld ||
        c === rep ||
        c === cmp ||
        c === sub ||
        c === LINE_FEED ||
        (c === CARRIAGE_RETURN && s.charAt(j + 1) === LINE_FEED)
      ) {
        break;
      }
      // Stryker disable next-line ConditionalExpression, EqualityOperator: the flag only skips decoding a run without the escape character, which decodes to itself
      if (c === esc) {
        escaped = true;
      }
      j += 1;
    }

    // Positions and line counts follow the source, so the raw slice advances.
    const raw = s.slice(this.i, j);
    this._fastAdvance(raw);
    const val =
      // Stryker disable next-line EqualityOperator: no TEXT token starts at msh2End, which is a field delimiter or the end of the input
      escaped && this.decodeEscapes && start.offset >= this.msh2End
        ? decodeEscapes(raw, this.delims)
        : raw;
    return this._tok("TEXT", val, start);
  }

  // ---- helpers ----
  private _slice(start: number, end: number): string {
    return this.input.slice(
      this.start + start,
      Math.min(this.start + end, this.input.length)
    );
  }

  // A segment ends at the segment delimiter, a line feed, or a carriage
  // return and a line feed: the length of the one at `at`, or 0.
  private _lineBreakAt(at: number): number {
    const c = this.input.charAt(at);
    if (c === CARRIAGE_RETURN && this.input.charAt(at + 1) === LINE_FEED) {
      return 2;
    }
    return c === this.delims.segment || c === LINE_FEED ? 1 : 0;
  }

  private _advance(n: number, isNewline = false) {
    this.i += n;
    if (isNewline) {
      this.line += 1;
      this.col = 1;
    } else {
      this.col += n;
    }
  }

  // TEXT tokens and Segment IDs stop at a line break, so the chunk holds none.
  private _fastAdvance(chunk: string) {
    this.i += chunk.length;
    this.col += chunk.length;
  }

  // The MSH bootstrap reads fixed offsets, which a truncated MSH can end past
  // a line break: in `MSH|^~\&\r\nPID`, MSH-2 is `^~\&\r`. A line break the
  // chunk cuts in two counts in the next token.
  private _advanceThrough(chunk: string) {
    const end = this.i + chunk.length;
    while (this.i < end) {
      const lineBreak = this._lineBreakAt(this.i);
      const isWhole = lineBreak > 0 && lineBreak <= end - this.i;
      this._advance(isWhole ? lineBreak : 1, isWhole);
    }
  }

  private _tok(
    type: TokenType,
    value: string | undefined,
    start: Position["start"]
  ): Token {
    const end = { column: this.col, line: this.line, offset: this.i };
    return { position: { end, start }, type, value };
  }

  // Iterable protocol (sync)
  [Symbol.iterator](): Iterator<Token> {
    return {
      next: () => {
        const t = this.next();
        if (!t) {
          return { done: true, value: undefined as unknown as Token };
        }
        return { done: false, value: t };
      },
    };
  }
}
