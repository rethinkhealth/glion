import type { Nodes, Root, Segment } from "@glion/ast";
import { visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";
import type { Point, Position } from "unist";
import type { VFile } from "vfile";

const CARRIAGE_RETURN = "\r";
const LINE_FEED = "\n";
const CARRIAGE_RETURN_LINE_FEED = "\r\n";

const messages = {
  carriageReturnLineFeed:
    "The segment ends with a carriage return and a line feed.",
  lineFeed: "The segment ends with a line feed.",
  noTerminator: "The segment has no segment terminator.",
  otherCharacter:
    "The segment ends with a character other than a carriage return.",
} as const;

const notes = {
  segmentTerminator:
    "HL7v2 ends every segment with a carriage return, the last one included.",
} as const;

/**
 * The terminator after `end` in `text`: `\r\n`, `\r`, `\n`, an empty string
 * at the end of the text, or the one character there.
 */
const terminatorAt = (text: string, end: number): string =>
  text.startsWith(CARRIAGE_RETURN_LINE_FEED, end)
    ? CARRIAGE_RETURN_LINE_FEED
    : text.charAt(end);

/**
 * The span of a terminator of `length` characters after a segment that ends
 * at `end`, `offset` characters into the text: to the start of the next line.
 */
const terminatorPlace = (end: Point, offset: number, length: number) => ({
  end: { column: 1, line: end.line + 1, offset: offset + length },
  start: end,
});

/** Reports `reason` on `segment`, at `place`, with the terminator found. */
const report = (
  file: VFile,
  reason: string,
  segment: Segment,
  ancestors: readonly Nodes[],
  place: Point | Position,
  actual?: string
): void => {
  const message = file.message(reason, {
    ancestors: [...ancestors, segment],
    place,
  });
  message.actual = actual;
  message.expected = [CARRIAGE_RETURN];
  message.note = notes.segmentTerminator;
};

/**
 * Lint rule that reports a segment that does not end with a carriage return.
 *
 * Reads the text after each segment in the file the tree was parsed from, so
 * positions MUST point into that text, as `@glion/parser`'s do unless a
 * `preprocess` step rewrites the input. A segment without a position, or a
 * file with no text, is not checked.
 */
const hl7v2LintSegmentTerminator = lintRule<Root>(
  {
    origin: "hl7v2-lint:segment-terminator",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-segment-terminator#readme",
  },
  (tree, file) => {
    const text = String(file);
    if (text === "") {
      return;
    }
    visit(tree, "segment", (segment, ancestors) => {
      const end = segment.position?.end;
      if (end?.offset === undefined) {
        return;
      }
      const { offset } = end;
      const terminator = terminatorAt(text, offset);
      switch (terminator) {
        case CARRIAGE_RETURN: {
          break;
        }
        case LINE_FEED: {
          report(
            file,
            messages.lineFeed,
            segment,
            ancestors,
            terminatorPlace(end, offset, terminator.length),
            terminator
          );
          break;
        }
        case CARRIAGE_RETURN_LINE_FEED: {
          report(
            file,
            messages.carriageReturnLineFeed,
            segment,
            ancestors,
            terminatorPlace(end, offset, terminator.length),
            terminator
          );
          break;
        }
        case "": {
          report(file, messages.noTerminator, segment, ancestors, end);
          break;
        }
        default: {
          // A segment delimiter set to another character in the parser
          // settings.
          report(
            file,
            messages.otherCharacter,
            segment,
            ancestors,
            terminatorPlace(end, offset, terminator.length),
            terminator
          );
          break;
        }
      }
    });
  }
);

export default hl7v2LintSegmentTerminator;
