/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1100.
 *
 * Date: 2026-10-24
 * Symptom: an MSH-2 longer than four characters changed on every round trip:
 * `MSH|^~\~\F\\` was written back as `MSH|^~\~|\`, then `MSH|^~\~|\E\`.
 * Cause: the tokenizer read the first four characters of MSH-2 as they are
 * written and decoded the escape sequences in the rest, while `@glion/to-hl7v2`
 * writes all of MSH-2 as it is.
 * Resolution: the tokenizer decodes nothing in MSH-2.
 */

import type { Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const encodingCharacters = (source: string) => {
  const msh = parseHL7v2(source).children[0] as Segment;
  return msh.children[1]?.children[0]?.children[0]?.children[0]?.value;
};

describe("an escape sequence in MSH-2 after its fourth character", () => {
  it("is read as it is written", () => {
    expect(encodingCharacters("MSH|^~\\&\\F\\|a")).toBe("^~\\&\\F\\");
  });

  it("is read as it is written when MSH-2 ends the message", () => {
    expect(encodingCharacters("MSH|^~\\~\\F\\\\")).toBe("^~\\~\\F\\\\");
  });

  it("is read as it is written with other delimiters", () => {
    expect(encodingCharacters("MSH#*!%+%T%#a")).toBe("*!%+%T%");
  });

  it("leaves the escape sequences of MSH-3 decoded", () => {
    const msh = parseHL7v2("MSH|^~\\&\\F\\|a\\F\\b").children[0] as Segment;

    expect(msh.children[2]?.children[0]?.children[0]?.children[0]?.value).toBe(
      "a|b"
    );
  });
});
