import type { Delimiters, Segment } from "@glion/ast";
import { f, m, s } from "@glion/builder";
import { parseHL7v2 } from "@glion/parser";
import { unified } from "unified";

import { hl7v2DecodeEscapes } from "../src/index";

describe("hl7v2DecodeEscapes plugin", () => {
  it("decodes standard delimiter escapes with default delimiters", async () => {
    const tree = m(
      s("PID", f("Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped"))
    );
    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value|More^Stuff~Again&Sub\\E\\Escaped");
  });

  it("decodes using custom delimiters from options", async () => {
    const customDelimiters = {
      component: "$",
      escape: "\\",
      field: "*",
      repetition: "%",
      subcomponent: "@",
    } satisfies Delimiters;

    const tree = m(
      s("PID", f("Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped"))
    );
    const results = await unified()
      .use(hl7v2DecodeEscapes, { delimiters: customDelimiters })
      .run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Value*More$Stuff%Again@Sub\\E\\Escaped");
  });

  it("keeps .br as written", async () => {
    const tree = m(s("PID", f("Line1\\.br\\Line2")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Line1\\.br\\Line2");
  });

  it("decodes the hex escapes of control characters", async () => {
    const tree = m(s("PID", f("Hello\\X0A\\World\\X0D\\Done\\X41\\")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Hello\nWorld\rDone\\X41\\");
  });

  it("leaves unknown escapes untouched", async () => {
    const tree = m(s("PID", f("Unknown\\ABC\\Value")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("Unknown\\ABC\\Value");
  });

  it("keeps highlight commands while decoding delimiter escapes", async () => {
    const tree = m(s("PID", f("\\H\\Important\\N\\ value\\F\\pipe")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("\\H\\Important\\N\\ value|pipe");
  });

  it("handles unterminated escape sequences", async () => {
    const tree = m(s("PID", f("Value\\Unterminated")));

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

  it("reads with the delimiters MSH declares, and changes nothing on a tree the parser read", async () => {
    // MSH-2 `^~#&`: the escape character is `#`, so `\T\` is data.
    const tree = parseHL7v2("MSH|^~#&|APP|FAC\rPID|1||A\\T\\B#T#C\r");
    const before = JSON.stringify(tree);

    await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(JSON.stringify(tree)).toBe(before);
  });

  it("leaves MSH-2 as it is", async () => {
    // After the four encoding characters, `\\F\\` would read as `|`.
    const tree = parseHL7v2("MSH|^~\\&\\\\F\\|a\r", { decodeEscapes: false });

    await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (tree.children[0] as Segment)?.children[1]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("^~\\&\\\\F\\");
  });

  it("leaves a subcomponent without a value as it is", async () => {
    const tree = m(s("PID", f("x")));
    const subcomponent = (tree.children[0] as Segment).children[0]?.children[0]
      ?.children[0]?.children[0];
    Object.assign(subcomponent ?? {}, { value: undefined });
    const results = await unified().use(hl7v2DecodeEscapes).run(tree);
    expect(
      (results.children[0] as Segment).children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBeUndefined();
  });

  it("does nothing when there are no escapes", async () => {
    const tree = m(s("PID", f("PlainValue")));

    const results = await unified().use(hl7v2DecodeEscapes).run(tree);

    expect(
      (results.children[0] as Segment)?.children[0]?.children[0]?.children[0]
        ?.children[0]?.value
    ).toBe("PlainValue");
  });
});
