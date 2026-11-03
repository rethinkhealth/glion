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
 * the field separator). Since ADR 0036 the escape character is written as
 * data only before a separator or a control character, with the same
 * fallback: `<X3C<` when `E` is a delimiter.
 */

import type { Delimiters } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { escapes } from "../../src";

describe("a value written with a delimiter that is an escape code", () => {
  it("writes the escape character as data with its hexadecimal escape when the component separator is `E`", () => {
    // MSH-2 `E\<$`: `<` before the field separator `^` is data, and `<E<`
    // would split at the component separator.
    const d: Delimiters = {
      component: "E",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "$",
    };
    const wire = escapes.write("a<b^c", d);

    expect(wire).toBe("a<X3C<b<F<c");
    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });

  it("writes a separator with its hexadecimal escape when its named code is the component separator", () => {
    // `\F\` would split at the component separator `F`.
    const d: Delimiters = {
      component: "F",
      escape: "<",
      field: "^",
      repetition: "\\",
      subcomponent: "$",
    };
    const wire = escapes.write("a^b", d);

    expect(wire).toBe("a<X5E<b");
    expect(escapes.read(wire, d)).toBe("a^b");
  });

  it("writes a hexadecimal digit in lowercase when its uppercase form is a delimiter", () => {
    // `\R\` holds the field separator `R`, and `\X7E\` holds the subcomponent separator `E`.
    const d: Delimiters = {
      component: "|",
      escape: "\\",
      field: "R",
      repetition: "~",
      subcomponent: "E",
    };
    const wire = escapes.write("a~b", d);

    expect(wire).toBe("a\\X7e\\b");
    expect(escapes.read(wire, d)).toBe("a~b");
  });

  it("writes the escape character as data with its hexadecimal escape when it is `E`", () => {
    // `EEE` reads as an escape sequence with the code `E`, not as `E`.
    const d: Delimiters = {
      component: ",",
      escape: "E",
      field: ">",
      repetition: "+",
      subcomponent: "`",
    };
    const wire = escapes.write("aEb>c", d);

    expect(wire).toBe("aEX45EbEFEc");
    expect(escapes.write(escapes.read(wire, d), d)).toBe(wire);
  });
});
