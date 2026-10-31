/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1165.
 *
 * Date: 2026-10-31
 *
 * Symptom: data that looks like an escape sequence was written back as that
 * sequence. `\E\H\E\`, the three characters `\H\`, came back as `\H\`, a
 * highlighting command (HL7v2 §2.7.1); `\E\.sp\E\` came back as the
 * formatting command `\.sp\`, and `\E\Zab\E\` as the locally defined
 * sequence `\Zab\`.
 *
 * Cause: `decodeEscapes` read `\E\` as the escape character and kept `\H\`,
 * `\.sp\`, and `\Z…\` as their text, so the data `\H\` and the command `\H\`
 * gave the same value, and `encodeEscapes` wrote both as the command.
 *
 * HL7v2 §2.7.1: "When delimiters are included in any component, the
 * delimiters SHALL be escaped." The escape character is one of them, so the
 * data `\H\` is always sent `\E\H\E\`, and `\H\` on the wire is always the
 * command.
 *
 * Resolution: ADR 0036. `\E\` is not decoded, so the data and the command are
 * two different values, and each is written back as it arrived.
 */

import type { Delimiters } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { decodeEscapes, encodeEscapes } from "../../src";

const d: Delimiters = {
  component: "^",
  escape: "\\",
  field: "|",
  repetition: "~",
  subcomponent: "&",
};

describe("data that looks like an escape sequence (HL7v2 §2.7.1)", () => {
  it("is written back as data when it looks like a highlighting command", () => {
    const received = String.raw`see \E\H\E\ in OBX-5`;

    expect(encodeEscapes(decodeEscapes(received, d), d)).toBe(received);
  });

  it("is written back as data when it looks like a formatting command", () => {
    const received = String.raw`\E\.sp\E\ 2`;

    expect(encodeEscapes(decodeEscapes(received, d), d)).toBe(received);
  });

  it("is written back as data when it looks like a locally defined sequence", () => {
    const received = String.raw`C:\E\Zab\E\scan.dcm`;

    expect(encodeEscapes(decodeEscapes(received, d), d)).toBe(received);
  });

  it("reads to a value other than the command it looks like", () => {
    // The receiver's display must tell the two apart, so the tree must too.
    expect(decodeEscapes(String.raw`a\E\H\E\b`, d)).not.toBe(
      decodeEscapes(String.raw`a\H\b`, d)
    );
  });
});
