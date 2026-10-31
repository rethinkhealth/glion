import type { Delimiters } from "@glion/ast";

import { DEFAULT_DELIMITERS } from "../src/constants";
import { decodeEscapes } from "../src/escape-decoding";

const CUSTOM_DELIMITERS: Delimiters = {
  component: "$",
  escape: "#",
  field: "*",
  repetition: "%",
  subcomponent: "@",
};

describe(decodeEscapes, () => {
  it("decodes the separator escapes to the default separators", () => {
    expect(
      decodeEscapes(
        "Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub",
        DEFAULT_DELIMITERS
      )
    ).toBe("Value|More^Stuff~Again&Sub");
  });

  it("decodes the separator escapes to custom separators", () => {
    expect(
      decodeEscapes("Value#F#More#S#Stuff#R#Again#T#Sub", CUSTOM_DELIMITERS)
    ).toBe("Value*More$Stuff%Again@Sub");
  });

  it("keeps the escape character escape as it is, since a decoded escape character would read as the start of a sequence", () => {
    expect(decodeEscapes("Smith\\E\\Jones", DEFAULT_DELIMITERS)).toBe(
      "Smith\\E\\Jones"
    );
  });

  it("keeps the truncation character escape as it is", () => {
    expect(decodeEscapes("abcde\\P\\", DEFAULT_DELIMITERS)).toBe("abcde\\P\\");
  });

  it("keeps .br as it is, since it is a formatting command and not a character", () => {
    expect(decodeEscapes("Line1\\.br\\Line2", DEFAULT_DELIMITERS)).toBe(
      "Line1\\.br\\Line2"
    );
  });

  it("decodes the hex escape of a control character to that character", () => {
    expect(
      decodeEscapes("Hello\\X0A\\World\\X0D\\Done\\X09\\", DEFAULT_DELIMITERS)
    ).toBe("Hello\nWorld\rDone\t");
  });

  it("keeps a hex escape of a control character with lowercase digits as it is, since the table writes uppercase", () => {
    expect(decodeEscapes("a\\X0d\\b", DEFAULT_DELIMITERS)).toBe("a\\X0d\\b");
  });

  it("keeps a hex escape of more than one byte as it is", () => {
    expect(decodeEscapes("a\\X0D0A\\b\\X414243\\", DEFAULT_DELIMITERS)).toBe(
      "a\\X0D0A\\b\\X414243\\"
    );
  });

  it("keeps a hex escape of a character outside the table as it is, since that character has a second form on the wire", () => {
    expect(
      decodeEscapes("caf\\XC3A9\\ \\X41\\ \\X7C\\", DEFAULT_DELIMITERS)
    ).toBe("caf\\XC3A9\\ \\X41\\ \\X7C\\");
  });

  it("decodes the hex escape of a separator whose named code holds a delimiter", () => {
    const d = { ...CUSTOM_DELIMITERS, component: "F" };

    expect(decodeEscapes("a#X2A#b", d)).toBe("a*b");
  });

  it("keeps the hex escape of the escape character as it is", () => {
    expect(
      decodeEscapes("a<X3C<b", {
        ...CUSTOM_DELIMITERS,
        component: "E",
        escape: "<",
      })
    ).toBe("a<X3C<b");
  });

  it("leaves a hex escape with an odd number of digits untouched", () => {
    expect(decodeEscapes("A\\X414\\B\\X4\\C", DEFAULT_DELIMITERS)).toBe(
      "A\\X414\\B\\X4\\C"
    );
  });

  it("leaves a hex escape whose bytes are not UTF-8 untouched", () => {
    expect(decodeEscapes("caf\\XE9\\ \\XC3\\", DEFAULT_DELIMITERS)).toBe(
      "caf\\XE9\\ \\XC3\\"
    );
  });

  it("leaves a hex escape without digits untouched", () => {
    expect(decodeEscapes("A\\X\\B", DEFAULT_DELIMITERS)).toBe("A\\X\\B");
  });

  it("leaves a hex escape whose content is not hexadecimal digits untouched", () => {
    expect(decodeEscapes("A\\X-1\\B\\XZZ\\C", DEFAULT_DELIMITERS)).toBe(
      "A\\X-1\\B\\XZZ\\C"
    );
  });

  it("leaves an unknown escape untouched", () => {
    expect(decodeEscapes("Unknown\\ABC\\Value", DEFAULT_DELIMITERS)).toBe(
      "Unknown\\ABC\\Value"
    );
  });

  it("keeps the highlight commands as they are", () => {
    expect(
      decodeEscapes("\\H\\Important\\N\\ value\\F\\pipe", DEFAULT_DELIMITERS)
    ).toBe("\\H\\Important\\N\\ value|pipe");
  });

  it("keeps a sequence whose content is the escape of a separator, as two sequences around it", () => {
    expect(decodeEscapes("\\E\\F\\E\\", DEFAULT_DELIMITERS)).toBe(
      "\\E\\F\\E\\"
    );
  });

  it("keeps a formatting command as it is", () => {
    expect(
      decodeEscapes("a\\.sp 2\\b\\.in+4\\c\\.ce\\d", DEFAULT_DELIMITERS)
    ).toBe("a\\.sp 2\\b\\.in+4\\c\\.ce\\d");
  });

  it("keeps a locally defined sequence as it is", () => {
    expect(decodeEscapes("a\\Zsite 7\\b\\Z\\c", DEFAULT_DELIMITERS)).toBe(
      "a\\Zsite 7\\b\\Z\\c"
    );
  });

  it("keeps a character set switch as it is", () => {
    expect(
      decodeEscapes(
        "\\C2842\\abc\\M2442\\def\\M242844\\ghi",
        DEFAULT_DELIMITERS
      )
    ).toBe("\\C2842\\abc\\M2442\\def\\M242844\\ghi");
  });

  it("leaves an escape character without a closing one untouched", () => {
    expect(decodeEscapes("Value\\Unterminated", DEFAULT_DELIMITERS)).toBe(
      "Value\\Unterminated"
    );
  });

  it("returns a value without escapes as it is", () => {
    expect(decodeEscapes("PlainValue", DEFAULT_DELIMITERS)).toBe("PlainValue");
  });
});
