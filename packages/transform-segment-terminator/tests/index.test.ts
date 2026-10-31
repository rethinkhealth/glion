import type { Group, Root, Segment } from "@glion/ast";
import { c, f, g, m, r, s } from "@glion/builder";
import { hl7v2Parser, parseHL7v2 } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import { hl7v2TransformSegmentTerminator } from "../src";

const terminators = (nodes: readonly (Segment | Group)[]): unknown[] =>
  nodes.map((node) =>
    node.type === "group" ? terminators(node.children) : node.terminator
  );

const transform = (tree: Root): Root =>
  unified().use(hl7v2TransformSegmentTerminator).runSync(tree);

describe("hl7v2TransformSegmentTerminator", () => {
  it("ends every segment with a carriage return, whatever line break it was read with", () => {
    const tree = transform(parseHL7v2("MSH|^~\\&\r\nPID|1\nPV1|1\rOBX|1"));

    expect(terminators(tree.children as Segment[])).toStrictEqual([
      "\r",
      "\r",
      "\r",
      "\r",
    ]);
  });

  it("ends the segments inside groups with a carriage return", () => {
    const pid = s("PID", f("1"));
    const pv1 = s("PV1", f("1"));
    pid.terminator = "\n";
    pv1.terminator = "";
    const tree = transform(
      m(s("MSH", f("|"), f("^~\\&")), g("PATIENT", pid, g("VISIT", pv1)))
    );

    expect(terminators(tree.children as (Segment | Group)[])).toStrictEqual([
      "\r",
      ["\r", ["\r"]],
    ]);
  });

  it("changes the tree it is given", () => {
    const tree = parseHL7v2("MSH|^~\\&\r\nPID|1");

    expect(transform(tree)).toBe(tree);
    expect(terminators(tree.children as Segment[])).toStrictEqual(["\r", "\r"]);
  });

  it("leaves a fragment's fields, repetitions, components, and subcomponents as they are", () => {
    const field = f("1");
    const repetition = r("2");
    const component = c("3");
    const subcomponent = { type: "subcomponent", value: "4" } as const;

    expect(
      transform(m(field, repetition, component, subcomponent)).children
    ).toStrictEqual([f("1"), r("2"), c("3"), subcomponent]);
  });

  it("writes a message read with line feeds and no final terminator with a carriage return after every segment", async () => {
    const file = await unified()
      .use(hl7v2Parser)
      .use(hl7v2TransformSegmentTerminator)
      .use(hl7v2ToHl7v2)
      .process("MSH|^~\\&|APP\nPID|1||DOE^JOHN\r\nPV1|1");

    expect(String(file)).toBe("MSH|^~\\&|APP\rPID|1||DOE^JOHN\rPV1|1\r");
  });
});
