import type { Node, Segment } from "@glion/ast";
import { lintRule } from "unified-lint-rule";
import { visitParents } from "unist-util-visit-parents";

const CARRIAGE_RETURN = "\r";
const LINE_FEED = "\n";
const CARRIAGE_RETURN_LINE_FEED = "\r\n";

const messages = {
  carriageReturnLineFeed:
    "The segment ends with a carriage return and a line feed.",
  lineFeed: "The segment ends with a line feed.",
  noTerminator: "The segment has no segment terminator.",
} as const;

const notes = {
  segmentTerminator:
    "HL7v2 ends every segment with a carriage return, the last one included.",
} as const;

/**
 * The line break after `end` in `text`: `\r\n`, `\r`, `\n`, an empty string
 * at the end of the text, or the one character there.
 */
const lineBreakAt = (text: string, end: number): string =>
  text.startsWith(CARRIAGE_RETURN_LINE_FEED, end)
    ? CARRIAGE_RETURN_LINE_FEED
    : text.charAt(end);

/**
 * Lint rule that reports a segment that does not end with a carriage return.
 *
 * Reads the text after each segment in the file the tree was parsed from. A
 * segment without a position, or a file with no text, is not checked.
 */
const hl7v2LintSegmentTerminator = lintRule<Node>(
  {
    origin: "hl7v2-lint:segment-terminator",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-segment-terminator#readme",
  },
  (tree, file) => {
    const text = String(file);
    if (text === "") {
      return;
    }
    visitParents(tree, "segment", (segment: Segment, ancestors) => {
      const end = segment.position?.end;
      const offset = end?.offset;
      if (end === undefined || offset === undefined) {
        return;
      }
      // The finding covers the line break that ends the segment, from the
      // segment's last character to the start of the next line.
      const reportLineBreak = (reason: string, lineBreak: string) => {
        const message = file.message(reason, {
          ancestors: [...ancestors, segment],
          place: {
            end: {
              column: 1,
              line: end.line + 1,
              offset: offset + lineBreak.length,
            },
            start: end,
          },
        });
        message.actual = lineBreak;
        message.expected = [CARRIAGE_RETURN];
        message.note = notes.segmentTerminator;
      };
      const lineBreak = lineBreakAt(text, offset);
      switch (lineBreak) {
        case CARRIAGE_RETURN: {
          break;
        }
        case LINE_FEED: {
          reportLineBreak(messages.lineFeed, lineBreak);
          break;
        }
        case CARRIAGE_RETURN_LINE_FEED: {
          reportLineBreak(messages.carriageReturnLineFeed, lineBreak);
          break;
        }
        case "": {
          const message = file.message(messages.noTerminator, {
            ancestors: [...ancestors, segment],
            place: end,
          });
          message.expected = [CARRIAGE_RETURN];
          message.note = notes.segmentTerminator;
          break;
        }
        default: {
          // A segment delimiter set to another character in the parser
          // settings.
          break;
        }
      }
    });
  }
);

export default hl7v2LintSegmentTerminator;
