/**
 * QR3: Crash Resilience — Property-based fuzz testing.
 *
 * Uses fast-check to prove the parser never throws on any input, and that it
 * positions every node of the tree it returns. Every error must be surfaced as
 * a VFileMessage diagnostic, never as a thrown exception. This is the crash
 * boundary that protects every consumer application, and positions are what a
 * lint finding points at.
 */
import type { Delimiters, Nodes } from "@glion/ast";
import { parseHL7v2 } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { delimiters } from "@glion/util-query";
import fc from "fast-check";

import {
  arbAdversarialInput,
  arbHL7v2Message,
  arbHL7v2MessageCustomDelimiters,
  arbHL7v2Segments,
  arbMutatedCustomDelimiterMessage,
  arbMutatedMessage,
} from "../src/arbitraries";

const NUM_RUNS = 300;

/**
 * Expect `node` and each node under it to cover exactly the text the
 * serializer writes for it. MSH-1 and MSH-2 are written as they are.
 */
const expectWrittenAt = (
  source: string,
  node: Nodes,
  d: Delimiters,
  encodeEscapes: boolean
): void => {
  const { end, start } = node.position ?? {};

  expect(source.slice(start?.offset, end?.offset)).toBe(
    toHl7v2(node, d, { encodeEscapes })
  );
  if (!("children" in node)) {
    return;
  }
  for (const [index, child] of (node.children as Nodes[]).entries()) {
    const isEncodingField =
      node.type === "segment" && node.name === "MSH" && index < 2;
    expectWrittenAt(source, child, d, encodeEscapes && !isEncodingField);
  }
};

/**
 * Expect `node` to lie within `[from, to]` and each node under it to lie within
 * its parent, after the sibling before it.
 */
const expectNested = (node: Nodes, from: number, to: number): void => {
  const start = node.position?.start.offset ?? -1;
  const end = node.position?.end.offset ?? -1;

  expect(start).toBeGreaterThanOrEqual(from);
  expect(end).toBeGreaterThanOrEqual(start);
  expect(end).toBeLessThanOrEqual(to);
  if (!("children" in node)) {
    return;
  }
  let next = start;
  for (const child of node.children as Nodes[]) {
    expectNested(child, next, end);
    next = child.position?.end.offset ?? end;
  }
};

describe("QR3: crash resilience", () => {
  describe("structurally valid messages", () => {
    // The parser positions every node at the text it was read from: the root
    // at the whole message, its segment terminators included, a segment at its
    // line, a field, repetition, component, or subcomponent at its text with
    // the delimiters inside it.
    //
    // Mutant: a component delimiter extends no node's end (#1102). Fails on
    // `"MSH|^~\\&|^|\r"`.
    //
    // Mutant: the root ends at its last segment, before the segment
    // terminator after it. Fails on `"MSH|^~\\&|^|\r"`.
    it("positions every node at the text it was read from", () => {
      fc.assert(
        fc.property(arbHL7v2Message, (msg) => {
          const root = parseHL7v2(msg);

          expectWrittenAt(msg, root, delimiters(root), true);
        }),
        { examples: [["MSH|^~\\&|^|\r"]], numRuns: NUM_RUNS }
      );
    });

    // A segment ends at a carriage return, a line feed, or both, and every
    // node is positioned at its text in the message as it was read, whichever
    // line breaks it holds (#1139). The root covers the whole message.
    //
    // Mutant: the line breaks are replaced with `\r` before the message is
    // tokenized. Fails on `"MSH|^~\\&|||\r\nAAA|\r\n"`.
    it("positions every node at its text, whichever line breaks end the segments", () => {
      const arbLineBreaks = arbHL7v2Segments.chain((segments) =>
        fc
          .array(fc.constantFrom("\r", "\n", "\r\n"), {
            maxLength: segments.length,
            minLength: segments.length,
          })
          .map((breaks) =>
            segments
              .map((segment, index) => `${segment}${breaks[index]}`)
              .join("")
          )
      );

      fc.assert(
        fc.property(arbLineBreaks, (source) => {
          const root = parseHL7v2(source);

          expect(root.position?.start.offset).toBe(0);
          expect(root.position?.end.offset).toBe(source.length);
          for (const segment of root.children) {
            expectWrittenAt(source, segment, delimiters(root), true);
          }
        }),
        {
          examples: [["MSH|^~\\&|||\r\nAAA|\r\n"], ["MSH|^~\\&|||\nAAA|\r"]],
          numRuns: NUM_RUNS,
        }
      );
    });
  });

  describe("custom delimiter messages", () => {
    // The parser positions every node at the text it was read from, whatever
    // delimiters MSH declares.
    //
    // Mutant: a component delimiter extends no node's end (#1102). Fails on
    // `"MSH#*!%+#*#\r"`.
    //
    // Mutant: the root ends at its last segment, before the segment
    // terminator after it. Fails on `"MSH#*!%+#*#\r"`.
    it("positions every node at the text it was read from", () => {
      fc.assert(
        fc.property(arbHL7v2MessageCustomDelimiters, (msg) => {
          const root = parseHL7v2(msg);

          expectWrittenAt(msg, root, delimiters(root), true);
        }),
        { examples: [["MSH#*!%+#*#\r"]], numRuns: NUM_RUNS }
      );
    });
  });

  describe("mutated messages", () => {
    // The parser reads a message corrupted in transit without throwing, and
    // positions every node within the message, inside its parent, after the
    // sibling before it.
    //
    // Mutant: a component delimiter extends no node's end (#1102). Fails on
    // `"MSH|^~\\&|^|"`.
    it("never throws, and positions every node inside its parent", () => {
      fc.assert(
        fc.property(arbMutatedMessage, (msg) => {
          expectNested(parseHL7v2(msg), 0, msg.length);
        }),
        { examples: [["MSH|^~\\&|^|"]], numRuns: NUM_RUNS }
      );
    });
  });

  describe("mutated custom delimiter messages", () => {
    // The parser reads a message corrupted in transit without throwing,
    // whatever delimiters MSH declares, and positions every node within the
    // message, inside its parent, after the sibling before it.
    //
    // Mutant: a component delimiter extends no node's end (#1102). Fails on
    // `"MSH#*!%+#*#"`.
    it("never throws, and positions every node inside its parent", () => {
      fc.assert(
        fc.property(arbMutatedCustomDelimiterMessage, (msg) => {
          expectNested(parseHL7v2(msg), 0, msg.length);
        }),
        { examples: [["MSH#*!%+#*#"]], numRuns: NUM_RUNS }
      );
    });
  });

  describe("adversarial inputs", () => {
    // The parser reads any text without throwing, and positions every node
    // within the text, inside its parent, after the sibling before it.
    //
    // Mutant: only a TEXT token sets where the root starts (#1102). Fails on
    // `"|"`.
    it("never throws, and positions every node inside its parent", () => {
      fc.assert(
        fc.property(arbAdversarialInput, (msg) => {
          expectNested(parseHL7v2(msg), 0, msg.length);
        }),
        { examples: [["|"]], numRuns: NUM_RUNS }
      );
    });
  });
});
