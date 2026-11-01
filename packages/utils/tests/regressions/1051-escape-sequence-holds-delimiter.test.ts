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
 * the field separator). Since ADR 0036 the escape character is not decoded,
 * so its hexadecimal escape reads back as written, and is written the same
 * way again.
 */

import type { Delimiters } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { escapes } from "../../src";

describe("a value written with a delimiter that is an escape code", () => {
  it("holds no delimiter and is written the same way again when the component separator is `E`", () => {
    const d: Delimiters = {
      component: "E",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "$",
    };
    const wire = escapes.write("a<b", d);

    expect(wire).not.toContain(d.component);
    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });

  it("holds no delimiter and is written the same way again when the subcomponent separator is `E`", () => {
    const d: Delimiters = {
      component: "%",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "E",
    };
    const wire = escapes.write("a<b", d);

    expect(wire).not.toContain(d.subcomponent);
    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });

  it("holds no delimiter and is written the same way again when the field separator is `E`", () => {
    const d: Delimiters = {
      component: "|",
      escape: "~",
      field: "E",
      repetition: "^",
      subcomponent: "\\",
    };
    const wire = escapes.write("a~b", d);

    expect(wire).not.toContain(d.field);
    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });

  it("is written the same way again when the escape character is `E`", () => {
    const d: Delimiters = {
      component: ",",
      escape: "E",
      field: ">",
      repetition: "+",
      subcomponent: "`",
    };

    const wire = escapes.write("aEb", d);

    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });
});
