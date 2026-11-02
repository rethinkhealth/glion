/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1054.
 *
 * Date: 2026-10-20
 * Symptom: a Segment ID that holds the escape character, such as `Z\R\Z`, was
 * read as `Z~Z`; serialized and parsed again, the decoded repetition
 * separator split the segment and moved a field value.
 * Cause: the tokenizer decoded every text run that holds the escape
 * character, including the one that opens a segment.
 * Resolution: the text run that opens a segment is read as it is written. A
 * Segment ID is not a field, so it holds no escape sequences (HL7v2 §2.5.2,
 * §2.7).
 */

import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const valueOf = (text: string) => ({
  children: [
    {
      children: [
        {
          children: [{ type: "subcomponent", value: text }],
          type: "component",
        },
      ],
      type: "field-repetition",
    },
  ],
  type: "field",
});

describe("a Segment ID that holds the escape character", () => {
  it("is read as it is written after the segment terminator", () => {
    const root = parseHL7v2("MSH|^~\\&|a\rZ\\R\\Z|b");

    expect(root.children[1]).toMatchObject({
      children: [valueOf("b")],
      name: "Z\\R\\Z",
    });
  });

  it("is read as it is written at the start of the message", () => {
    const root = parseHL7v2("P\\T\\D|b");

    expect(root.children[0]).toMatchObject({
      children: [valueOf("b")],
      name: "P\\T\\D",
    });
  });

  it("leaves the escape sequences in its fields decoded", () => {
    const root = parseHL7v2("MSH|^~\\&|a\rZ\\R\\Z|\\R\\");

    expect(root.children[1]).toMatchObject({
      children: [valueOf("~")],
      name: "Z\\R\\Z",
    });
  });
});
