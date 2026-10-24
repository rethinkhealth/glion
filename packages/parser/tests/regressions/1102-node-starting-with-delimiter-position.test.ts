/**
 * Regression for https://github.com/rethinkhealth/glion/issues/1102.
 *
 * Date: 2026-10-24
 * Symptom: a field, repetition, or component whose text starts with a
 * delimiter was positioned outside its text: in `PID|^|`, the field covered
 * 4–4 instead of `^` at 4–5, and its repetition 5–5, outside the field.
 * Cause: a component or repetition delimiter built the empty node before it at
 * the delimiter's end, and no delimiter extended the end of the nodes holding
 * it; only text did. Only a TEXT token set where the root starts, so the root
 * of `|` covered 0–0.
 * Resolution: each delimiter places the empty node before it at its start and
 * extends every node that holds it to its end; the root starts at the first
 * token of any kind.
 */

import type { Field, Segment } from "@glion/ast";
import type { Node } from "unist";
import { describe, expect, it } from "vitest";

import { parseHL7v2 } from "../../src/parser";

const span = (node: Node) => [
  node.position?.start.offset,
  node.position?.end.offset,
];

const firstField = (source: string): Field =>
  (parseHL7v2(source).children[0] as Segment).children[0] as Field;

describe("a field whose text starts with a delimiter", () => {
  it("covers a component delimiter, with an empty component before it", () => {
    const field = firstField("PID|^|");
    const [repetition] = field.children;

    expect(span(field)).toStrictEqual([4, 5]);
    expect(span(repetition!)).toStrictEqual([4, 5]);
    expect(repetition!.children.map(span)).toStrictEqual([
      [4, 4],
      [5, 5],
    ]);
  });

  it("covers a repetition delimiter, with an empty repetition before it", () => {
    const field = firstField("PID|~|");

    expect(span(field)).toStrictEqual([4, 5]);
    expect(field.children.map(span)).toStrictEqual([
      [4, 4],
      [5, 5],
    ]);
  });

  it("covers a subcomponent delimiter, with an empty subcomponent before it", () => {
    const field = firstField("PID|&|");
    const component = field.children[0]!.children[0]!;

    expect(span(field)).toStrictEqual([4, 5]);
    expect(span(component)).toStrictEqual([4, 5]);
    expect(component.children.map(span)).toStrictEqual([
      [4, 4],
      [5, 5],
    ]);
  });

  it("covers the text after the delimiter", () => {
    const field = firstField("PID|^a|");
    const [repetition] = field.children;

    expect(span(field)).toStrictEqual([4, 6]);
    expect(span(repetition!)).toStrictEqual([4, 6]);
    expect(repetition!.children.map(span)).toStrictEqual([
      [4, 4],
      [5, 6],
    ]);
  });

  it("covers a delimiter at the end of the message", () => {
    expect(span(firstField("PID|^"))).toStrictEqual([4, 5]);
  });
});

describe("a message that holds no text", () => {
  it("has a root that covers its delimiters", () => {
    const root = parseHL7v2("|");

    expect(span(root)).toStrictEqual([0, 1]);
    expect(span(root.children[0]!)).toStrictEqual([0, 1]);
  });

  it("has a root that starts where the input starts", () => {
    const root = parseHL7v2("\r|");

    expect(span(root)).toStrictEqual([0, 2]);
    expect(span(root.children[0]!)).toStrictEqual([1, 2]);
  });
});
