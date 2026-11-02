/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1172.
 *
 * Date: 2026-11-01
 * Symptom: a message that does not open with MSH, or a bare `MSH` line, had
 * different delimiters in the tree from the ones the parser read it with.
 * `BHS|^~\\&|X` then `MSH|^~\\&|A` gave the component separator `A`, and
 * writing the tree threw `MissingSeparatorError`.
 * Cause: `delimiters()` took the first segment named MSH anywhere in the tree,
 * while the parser takes MSH-1 and MSH-2 only from a message header the message
 * opens with.
 * Resolution: `delimiters()` follows the parser's rule, so the tree and the
 * parser agree on every message.
 */

import { detectDelimiters, parseHL7v2 } from "@glion/parser";
import { DEFAULT_DELIMITERS } from "@glion/utils";
import { describe, expect, it } from "vitest";

import { delimiters } from "../../src";

const read = (input: string) =>
  detectDelimiters({ delimiters: DEFAULT_DELIMITERS, input }).delimiters;

describe("the delimiters of a tree and the delimiters the parser read it with", () => {
  it.each([
    ["no message header", "PID|1||a&b^c\r"],
    ["no text", ""],
    ["only an empty line", "\r"],
    ["a message header with no fields", "MSH\rPID|1||a^b\r"],
    ["a message header with only MSH-1", "MSH|\rPID|1\r"],
    ["a message header", "MSH|^~\\&|A\rPID|1\r"],
    ["three encoding characters", "MSH|^~&|A\r"],
    ["other delimiters", "MSH*%$#@*A\r"],
    ["empty lines before the message header", "\r\nMSH|*$#@|A\r"],
    ["a later message header", "PID|1||a&b\rMSH|*$#@|A\r"],
    ["a message header after a batch header", "BHS|^~\\&|X\rMSH|^~\\&|A\r"],
    ["a second message header", "MSH|^~\\&|A\rMSH|*$#@|B\r"],
    ["a Segment ID in lower case", "msh|^~\\&|A\r"],
    ["a delimiter above U+FFFF", "MSH|\u{1F600}~\\&|A\r"],
  ])("agree for %s", (_, input) => {
    expect(delimiters(parseHL7v2(input))).toStrictEqual(read(input));
  });
});
