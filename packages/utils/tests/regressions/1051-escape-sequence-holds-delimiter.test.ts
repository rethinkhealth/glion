/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1051.
 *
 * Date: 2026-10-20
 * Symptom: a message whose delimiters include a letter that is an escape
 * code grew on every parse and serialize round trip. With MSH-2 `E\<$#`,
 * MSH-3 `a<E<b` came back as `a<E<E<E<b`, then `a<E<E<E<E<E<E<E<b`.
 * Cause: `encodeEscapes` wrote the escape character as `<E<` although `E` is
 * the component separator, so the parser split the sequence at it. With `E`
 * as the escape character, `EEE` did not decode back to `E` either.
 * Resolution: an escape sequence whose escape code holds a delimiter is
 * written as `\Xdd\`, the hexadecimal escape of HL7v2 §2.7.5, with lowercase
 * digits when an uppercase digit is a delimiter (`~` is `\X7e\` when `E` is
 * the field separator).
 */

import type { Delimiters } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { decodeEscapes, encodeEscapes } from "../../src";

describe("a value written with a delimiter that is an escape code", () => {
  it("holds no delimiter and reads back when the component separator is `E`", () => {
    const d: Delimiters = {
      component: "E",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "$",
    };
    const wire = encodeEscapes("a<b", d);

    expect(wire).not.toContain(d.component);
    expect(decodeEscapes(wire, d)).toBe("a<b");
  });

  it("holds no delimiter and reads back when the subcomponent separator is `E`", () => {
    const d: Delimiters = {
      component: "%",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "E",
    };
    const wire = encodeEscapes("a<b", d);

    expect(wire).not.toContain(d.subcomponent);
    expect(decodeEscapes(wire, d)).toBe("a<b");
  });

  it("holds no delimiter and reads back when the field separator is `E`", () => {
    const d: Delimiters = {
      component: "|",
      escape: "~",
      field: "E",
      repetition: "^",
      subcomponent: "\\",
    };
    const wire = encodeEscapes("a~b", d);

    expect(wire).not.toContain(d.field);
    expect(decodeEscapes(wire, d)).toBe("a~b");
  });

  it("reads back when the escape character is `E`", () => {
    const d: Delimiters = {
      component: ",",
      escape: "E",
      field: ">",
      repetition: "+",
      subcomponent: "`",
    };

    expect(decodeEscapes(encodeEscapes("aEb", d), d)).toBe("aEb");
  });
});
