/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1167.
 *
 * Date: 2026-10-31
 *
 * Symptom: a value the sender wrote with the hexadecimal data `\X0D\` was
 * forwarded with the formatting command `\.br\` in its place. `a\X0D\b` was
 * read and written back as `a\.br\b`, and `a\X0D0A\b` as `a\.br\\X0A\b`.
 *
 * Cause: `decodeEscapes` read both `\X0D\` and `\.br\` as a carriage return,
 * so the two sequences gave the same value, and `encodeEscapes` writes a
 * carriage return as `\.br\`.
 *
 * Every version of HL7v2 from v2.4 to v2.8.2 gives the two sequences different
 * meanings, so a message read and written back must keep each one:
 *
 * - Hexadecimal data: "Consecutive pairs of the hexadecimal digits represent
 *   8-bit binary values. The interpretation of the data is entirely left to an
 *   agreement between the sending and receiving applications." `\X0D\` is the
 *   byte 0x0D, sent as data.
 * - Formatted text: `.br` means "Begin new output line. Set the horizontal
 *   position to the current left margin and increment the vertical position by
 *   1." It is an instruction for display.
 *
 * Resolution: ADR 0036. `\X0D\` is the one form of a carriage return that
 * `escapes.read` and `escapes.write` share, and `\.br\`, a formatting
 * command, stays in the value as written, as does `\X0D0A\`.
 */

import type { Delimiters } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { escapes } from "../../src";

const d: Delimiters = {
  component: "^",
  escape: "\\",
  field: "|",
  repetition: "~",
  subcomponent: "&",
};

describe("the hexadecimal data `\\X0D\\`", () => {
  it("is written back as `\\X0D\\`, the byte the sender wrote", () => {
    // The sender put the byte 0x0D in the value. HL7v2 leaves its meaning to
    // the agreement between sender and receiver, so a relay forwards the byte,
    // not a line break of its own.
    const received = String.raw`a\X0D\b`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("is written back as `\\X0D0A\\` when the byte 0x0D shares the sequence with 0x0A", () => {
    // One `\X…\` carries consecutive bytes, here 0x0D then 0x0A. The whole
    // sequence is data; splitting it into `\.br\` and `\X0A\` changes it.
    const received = String.raw`a\X0D0A\b`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });
});

describe("the formatting command `\\.br\\`", () => {
  it("is written back as `\\.br\\`, the line break the sender wrote", () => {
    // An FT value with two lines. `\.br\` tells the receiver's display to
    // start a new line; it is an instruction, not a character of the value.
    const received = String.raw`1. Normal\.br\2. Stable`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });
});

describe("a value with both `\\.br\\` and `\\X0D\\`", () => {
  it("reads the two sequences to different values, as one commands display and the other carries bytes", () => {
    // Two values that differ on the wire must differ once read, or no writer
    // can tell which one to send back.
    expect(escapes.read(String.raw`a\X0D\b`, d)).not.toBe(
      escapes.read(String.raw`a\.br\b`, d)
    );
  });

  it("writes each sequence back as the sender wrote it", () => {
    // The line break between the first two lines is a command; the byte
    // before `3. Home` is data. Each keeps its own form.
    const received = String.raw`1. Normal\.br\2. Stable\X0D\3. Home`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });
});
