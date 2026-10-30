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
  it("decodes the delimiter escapes to the default delimiters", () => {
    expect(
      decodeEscapes(
        "Value\\F\\More\\S\\Stuff\\R\\Again\\T\\Sub\\E\\Escaped",
        DEFAULT_DELIMITERS
      )
    ).toBe("Value|More^Stuff~Again&Sub\\Escaped");
  });

  it("decodes the delimiter escapes to custom delimiters", () => {
    expect(
      decodeEscapes(
        "Value#F#More#S#Stuff#R#Again#T#Sub#E#Escaped",
        CUSTOM_DELIMITERS
      )
    ).toBe("Value*More$Stuff%Again@Sub#Escaped");
  });

  it("decodes .br to the segment terminator, a carriage return", () => {
    expect(decodeEscapes("Line1\\.br\\Line2", DEFAULT_DELIMITERS)).toBe(
      "Line1\rLine2"
    );
  });

  it("decodes a hex escape to the character it names", () => {
    expect(
      decodeEscapes("Hello\\X0A\\World\\X0D\\Done", DEFAULT_DELIMITERS)
    ).toBe("Hello\nWorld\rDone");
  });

  it("decodes each pair of hex digits as one character", () => {
    expect(decodeEscapes("\\X414243\\", DEFAULT_DELIMITERS)).toBe("ABC");
  });

  it("decodes the bytes of a hex escape as UTF-8", () => {
    expect(decodeEscapes("caf\\XC3A9\\ \\XE282AC\\", DEFAULT_DELIMITERS)).toBe(
      "café €"
    );
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
