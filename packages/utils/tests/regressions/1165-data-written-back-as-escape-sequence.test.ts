/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1165.
 *
 * Date: 2026-10-31
 *
 * Symptom: data that looks like an escape sequence was written back as that
 * sequence. `\E\H\E\`, the three characters `\H\`, came back as `\H\`, a
 * highlighting command; `\E\.sp\E\` came back as the
 * formatting command `\.sp\`, and `\E\Zab\E\` as the locally defined
 * sequence `\Zab\`.
 *
 * Cause: `decodeEscapes` read `\E\` as the escape character and kept `\H\`,
 * `\.sp\`, and `\Z…\` as their text, so the data `\H\` and the command `\H\`
 * gave the same value, and `encodeEscapes` wrote both as the command.
 *
 * Every version of HL7v2 from v2.4 to v2.8.2 defines `\E\` as the escape
 * sequence of the escape character, and v2.8 and later state: "When delimiters
 * are included in any component, the delimiters SHALL be escaped." So the data
 * `\H\` is sent `\E\H\E\`, and `\H\` on the wire is the command.
 *
 * Resolution: ADR 0036. `\E\` is not decoded, so the data and the command are
 * two different values, and each is written back as it arrived.
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

describe("data that looks like an escape sequence", () => {
  it("is written back as data when it looks like a highlighting command", () => {
    const received = String.raw`see \E\H\E\ in OBX-5`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("is written back as data when it looks like a formatting command", () => {
    const received = String.raw`\E\.sp\E\ 2`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("is written back as data when it looks like a locally defined sequence", () => {
    const received = String.raw`C:\E\Zab\E\scan.dcm`;

    expect(escapes.write(escapes.read(received, d), d)).toBe(received);
  });

  it("reads to a value other than the command it looks like", () => {
    // The receiver's display must tell the two apart, so the tree must too.
    expect(escapes.read(String.raw`a\E\H\E\b`, d)).not.toBe(
      escapes.read(String.raw`a\H\b`, d)
    );
  });
});
