/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1166.
 *
 * Date: 2026-10-31
 *
 * Symptom: some escape sequences were written back as data. `abcde\P\` came
 * back as `abcde\E\P\E\`, the eight characters `abcde\P\` rather than a value
 * the sender truncated (HL7v2 §2.7.2); `\XFF\` came back as `\E\XFF\E\`; and
 * `\Q\`, a code HL7v2 does not define, as `\E\Q\E\`.
 *
 * Cause: `encodeEscapes` copied a sequence through only when it matched a
 * fixed list (`\H\`, `\N\`, formatting commands other than `\.br\`, `\Z…\`,
 * `\C…\`, `\M…\`), and wrote the escape characters of any other as `\E\`.
 *
 * HL7v2 §2.7.1 lists `\P\` among the sequences every field may use, and
 * §2.7.6 leaves the meaning of `\X…\` to an agreement between the sending and
 * receiving applications. A relay that is not party to that agreement
 * forwards the sequence as it arrived.
 *
 * Resolution: ADR 0036. `escapes.write` writes only separators and control
 * characters as escape sequences, and copies every escape character as it is,
 * so every sequence is written back whatever its code.
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

describe("an escape sequence outside the list glion used to copy", () => {
  it("is written back as the truncation character `\\P\\` (HL7v2 §2.7.2)", () => {
    const received = "abcde\\P\\";

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("is written back as hexadecimal data whose bytes are not UTF-8 (HL7v2 §2.7.6)", () => {
    const received = String.raw`a\XFF\b`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("is written back as a code HL7v2 does not define", () => {
    const received = String.raw`a\Q\b`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });
});
