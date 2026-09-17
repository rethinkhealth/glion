import type { Delimiters, Root, Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { hl7v2DecodeEscapes } from "@glion/decode-escapes";
import { unified } from "unified";

import { hl7v2EncodeEscapes } from "../src/index";

const subValue = (results: Root) =>
  (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
    ?.children[0]?.value;

describe("hl7v2EncodeEscapes plugin", () => {
  it("encodes field delimiter", async () => {
    const tree = m(s("PID", f("before|after")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("before\\F\\after");
  });

  it("encodes component delimiter", async () => {
    const tree = m(s("PID", f("before^after")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("before\\S\\after");
  });

  it("encodes repetition delimiter", async () => {
    const tree = m(s("PID", f("before~after")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("before\\R\\after");
  });

  it("encodes subcomponent delimiter", async () => {
    const tree = m(s("PID", f("before&after")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("before\\T\\after");
  });

  it("encodes escape character", async () => {
    const tree = m(s("PID", f("before\\after")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("before\\E\\after");
  });

  it("encodes segment delimiter as .br", async () => {
    const tree = m(s("PID", f("line1\rline2")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("line1\\.br\\line2");
  });

  it("encodes multiple special characters in one value", async () => {
    const tree = m(s("PID", f("a|b^c~d&e\\f")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f");
  });

  it("leaves plain text unchanged", async () => {
    const tree = m(s("PID", f("PlainValue123")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("PlainValue123");
  });

  it("handles empty values", async () => {
    const tree = m(s("PID", f("")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("");
  });

  it("uses custom delimiters from options", async () => {
    const customDelimiters = {
      component: "$",
      escape: "\\",
      field: "*",
      repetition: "%",
      segment: "\n",
      subcomponent: "@",
    } satisfies Delimiters;

    const tree = m(s("PID", f("a*b$c%d@e")));
    const results = await unified()
      .use(hl7v2EncodeEscapes, { delimiters: customDelimiters })
      .run(tree);
    expect(subValue(results)).toBe("a\\F\\b\\S\\c\\R\\d\\T\\e");
  });

  it("round-trips with decode: encode then decode restores original", async () => {
    const original = "Patient allergic to |Peanuts| and \rSevere reaction";
    const tree = m(s("PID", f(original)));

    const encoded = await unified().use(hl7v2EncodeEscapes).run(tree);
    const decoded = await unified().use(hl7v2DecodeEscapes).run(encoded);

    expect(subValue(decoded)).toBe(original);
  });

  it("round-trips with decode: all delimiter types", async () => {
    const original = "a|b^c~d&e\\f\rg";
    const tree = m(s("PID", f(original)));

    const encoded = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(encoded)).toBe("a\\F\\b\\S\\c\\R\\d\\T\\e\\E\\f\\.br\\g");

    const decoded = await unified().use(hl7v2DecodeEscapes).run(encoded);
    expect(subValue(decoded)).toBe(original);
  });

  it("options.delimiters override MSH-derived delimiters", async () => {
    // MSH has standard delimiters, but options override field to "*"
    const tree = m(s("MSH", f("|"), f("^~\\&")), s("PID", f("before*after")));

    // Override field delimiter via options — should take precedence over MSH
    const results = await unified()
      .use(hl7v2EncodeEscapes, { delimiters: { field: "*" } })
      .run(tree);

    // "*" is now the field delimiter, so it should be encoded as \F\
    const pid = (results as Root).children[1];
    const value =
      pid?.type === "segment"
        ? pid.children[0]?.children[0]?.children[0]?.children[0]?.value
        : undefined;
    expect(value).toBe("before\\F\\after");
  });

  it("does not double-encode already-escaped values", async () => {
    // If a value contains literal backslash (the escape char),
    // it should be encoded as \E\ — not left as-is
    const tree = m(s("PID", f("test\\value")));
    const results = await unified().use(hl7v2EncodeEscapes).run(tree);
    expect(subValue(results)).toBe("test\\E\\value");
  });

  it("does not encode MSH-1 and MSH-2", async () => {
    // MSH-1 and MSH-2 define the delimiters and must not be escaped
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("test|value")));

    const results = await unified().use(hl7v2EncodeEscapes).run(tree);

    // MSH-1 should remain unchanged
    const msh = (results as Root).children[0] as Segment;
    expect(msh.children[0]?.children[0]?.children[0]?.children[0]?.value).toBe(
      "|"
    );
    // MSH-2 should remain unchanged
    expect(msh.children[1]?.children[0]?.children[0]?.children[0]?.value).toBe(
      "^~\\&"
    );
    // MSH-3 (field index 2) should be encoded
    expect(msh.children[2]?.children[0]?.children[0]?.children[0]?.value).toBe(
      "test\\F\\value"
    );
  });
});
