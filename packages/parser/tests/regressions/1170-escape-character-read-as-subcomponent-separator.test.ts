/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1170.
 *
 * Date: 2026-11-01
 * Symptom: with the three encoding characters `^~&`, the escape character and
 * the subcomponent separator were both `&`. The value `a|b`, written as
 * `a&F&b`, was read as the three subcomponents `a`, `F`, and `b`.
 * Cause: delimiter detection gave each role MSH-2 is too short to declare its
 * default, and the default subcomponent separator is `&`, which `^~&` had
 * already declared as the escape character.
 * Resolution: a role MSH-2 does not declare has no delimiter. HL7v2 v2.5.1
 * §2.5.4: the subcomponent separator "may be omitted" when there are no
 * subcomponents, and the escape character "must be present if subcomponents
 * are used". `^~&` declares the escape character `&` and no subcomponent
 * separator.
 */

import type { Component, Field, Segment } from "@glion/ast";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const pid3 = (segment: Segment): Component | undefined =>
  (segment.children[2] as Field).children[0]?.children[0];

describe("an MSH-2 of three encoding characters", () => {
  it("reads its third character as the escape character, and declares no subcomponent separator", () => {
    const tree = parseHL7v2("MSH|^~&|APP\rPID|1||a&F&b\r");
    const component = pid3(tree.children[1] as Segment);

    expect(
      component?.children.map((subcomponent) => subcomponent.value)
    ).toStrictEqual(["a|b"]);
  });

  it("reads a character it does not declare as data", () => {
    const tree = parseHL7v2("MSH|^~\\|APP\rPID|1||Smith&Jones\r");
    const component = pid3(tree.children[1] as Segment);

    expect(
      component?.children.map((subcomponent) => subcomponent.value)
    ).toStrictEqual(["Smith&Jones"]);
  });
});
