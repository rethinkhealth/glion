import type { Delimiters, Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { unified } from "unified";

import { hl7v2DecodeEscapes } from "../src/index";

describe("hl7v2DecodeEscapes plugin", () => {
  it("decodes standard delimiter escapes with default delimiters", async () => {
    const tree = m(
      s("MSH", f("Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped"))
    );
    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value|More^Stuff~Again&Sub\\Escaped");
  });

  it("decodes using custom delimiters from options", async () => {
    const customDelimiters = {
      component: "$",
      escape: "\\",
      field: "*",
      repetition: "%",
      segment: "\n",
      subcomponent: "@",
    } satisfies Delimiters;

    const tree = m(
      s("MSH", f("Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped"))
    );
    const results = await unified()
      .use(hl7v2DecodeEscapes, { delimiters: customDelimiters })
      .run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value*More$Stuff%Again@Sub\\Escaped");
  });

  it("decodes .br into the default segment delimiter", async () => {
    const tree = m(s("MSH", f("Line1\\.br\\Line2")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Line1\rLine2");
  });

  it("decodes hex escapes", async () => {
    const tree = m(s("MSH", f("Hello\\X0A\\World\\X0D\\Done")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Hello\nWorld\rDone");
  });

  it("leaves unknown escapes untouched", async () => {
    const tree = m(s("MSH", f("Unknown\\ABC\\Value")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Unknown\\ABC\\Value");
  });

  it("strips highlight start and end escapes", async () => {
    const tree = m(s("MSH", f("Before\\H\\Bold\\N\\After")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("BeforeBoldAfter");
  });

  it("strips highlight escapes while decoding delimiter escapes", async () => {
    const tree = m(s("MSH", f("\\H\\Important\\N\\ value\\F\\pipe")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Important value|pipe");
  });

  it("strips standalone highlight start escape", async () => {
    const tree = m(s("MSH", f("Text\\H\\Highlighted")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("TextHighlighted");
  });

  it("handles unterminated escape sequences", async () => {
    const tree = m(s("MSH", f("Value\\Unterminated")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value\\Unterminated");
  });

  it("options.delimiters override MSH-derived delimiters", async () => {
    // MSH has standard delimiters (field = "|"), but options override field to "*"
    const tree = m(s("MSH", f("|"), f("^~\\&"), f("Value\\F\\More")));

    // Override field delimiter via options — should take precedence over MSH
    const results = await unified()
      .use(hl7v2DecodeEscapes, { delimiters: { field: "*" } })
      .run(tree);

    // \F\ should decode to "*" (the option-provided field delimiter), not "|" (from MSH)
    expect(
      (results.children[0] as Segment)?.children[2]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value*More");
  });

  it("does nothing when there are no escapes", async () => {
    const tree = m(s("MSH", f("PlainValue")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("PlainValue");
  });
});
