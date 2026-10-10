import type { Nodes, Segment } from "@glion/ast";
import { c, f, g, m, s } from "@glion/builder";

import type { Test } from "../src";
import { createTest } from "../src/utils";

describe("createTest", () => {
  describe("null", () => {
    it("matches every node", () => {
      const predicate = createTest(null);

      expect(predicate(m(), [])).toBe(true);
      expect(predicate(s("MSH"), [])).toBe(true);
      expect(predicate(f("1"), [])).toBe(true);
      expect(predicate(c("1"), [])).toBe(true);
    });
  });

  describe("string", () => {
    it("matches a node whose type equals the string", () => {
      const predicate = createTest("segment");

      expect(predicate(s("MSH"), [])).toBe(true);
    });

    it("does not match a node of another type", () => {
      const predicate = createTest("segment");

      expect(predicate(f("1"), [])).toBe(false);
      expect(predicate(m(), [])).toBe(false);
    });

    it("does not match a value other than the node's type", () => {
      const predicate = createTest("MSH");

      expect(predicate(s("MSH"), [])).toBe(false);
    });
  });

  describe("function", () => {
    it("returns the function itself", () => {
      const test = (node: Nodes) => node.type === "field";

      expect(createTest(test)).toBe(test);
    });

    it("passes the node and its ancestors to the function", () => {
      const group = g("PATIENT", s("PID"));
      const tree = m(group);
      const segment = s("PID");
      const calls: [Nodes, Nodes[]][] = [];
      const predicate = createTest((node, ancestors) => {
        calls.push([node, ancestors]);
        return true;
      });

      predicate(segment, [tree, group]);

      expect(calls).toStrictEqual([[segment, [tree, group]]]);
    });
  });

  describe("object", () => {
    it("matches a node whose properties equal every value", () => {
      const predicate = createTest({ name: "MSH", type: "segment" });

      expect(predicate(s("MSH"), [])).toBe(true);
    });

    it("does not match when one value differs", () => {
      const predicate = createTest({ name: "PID", type: "segment" });

      expect(predicate(s("MSH"), [])).toBe(false);
    });

    it("matches every node for an empty object", () => {
      const predicate = createTest({});

      expect(predicate(m(), [])).toBe(true);
      expect(predicate(s("MSH"), [])).toBe(true);
    });

    it("compares with strict equality, without coercion", () => {
      const predicate = createTest({ name: 1 } as unknown as Partial<Segment>);

      expect(predicate(s("1"), [])).toBe(false);
    });

    it("compares objects by reference", () => {
      const segment = s("MSH");
      const sameShape = createTest({
        children: [...segment.children],
      } as Partial<Segment>);
      const sameReference = createTest({
        children: segment.children,
      } as Partial<Segment>);

      expect(sameShape(segment, [])).toBe(false);
      expect(sameReference(segment, [])).toBe(true);
    });

    it("matches an absent property with an undefined value", () => {
      const predicate = createTest({ name: undefined } as Partial<Segment>);

      expect(predicate(f("1"), [])).toBe(true);
    });

    it("matches a property set to undefined with an undefined value", () => {
      const segment = s("MSH");
      Object.assign(segment, { data: undefined });
      const predicate = createTest({ data: undefined } as Partial<Segment>);

      expect(predicate(segment, [])).toBe(true);
    });

    it("does not match a property with a value when the test value is undefined", () => {
      const predicate = createTest({ name: undefined } as Partial<Segment>);

      expect(predicate(s("MSH"), [])).toBe(false);
    });

    it("does not match a property the node does not have", () => {
      const predicate = createTest({ name: "MSH" } as Partial<Segment>);

      expect(predicate(f("1"), [])).toBe(false);
    });

    it("does not match an inherited member", () => {
      const byToString = createTest({
        toString: Object.prototype.toString,
      } as unknown as Test<Nodes>);
      const byHasOwnProperty = createTest({
        hasOwnProperty: Object.prototype.hasOwnProperty,
      } as unknown as Test<Nodes>);
      const byConstructor = createTest({
        constructor: Object,
      } as unknown as Test<Nodes>);

      expect(byToString(s("MSH"), [])).toBe(false);
      expect(byHasOwnProperty(s("MSH"), [])).toBe(false);
      expect(byConstructor(s("MSH"), [])).toBe(false);
    });

    it("does not match an own __proto__ key", () => {
      const predicate = createTest(
        JSON.parse('{"__proto__":{},"type":"segment"}') as Partial<Segment>
      );

      expect(predicate(s("MSH"), [])).toBe(false);
    });

    it("reads the object's entries once, when the predicate is created", () => {
      const test: Partial<Segment> = { name: "MSH" };
      const predicate = createTest(test);

      test.name = "PID";
      Object.assign(test, { type: "field" });

      expect(predicate(s("MSH"), [])).toBe(true);
      expect(predicate(s("PID"), [])).toBe(false);
    });
  });
});
