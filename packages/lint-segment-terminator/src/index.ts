import type { Root } from "@glion/ast";
import { visit } from "@glion/util-visit";
import { lintRule } from "unified-lint-rule";

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
 * Lint rule that reports a segment that does not end with a carriage return.
 *
 * Reads each segment's `terminator`, as `@glion/parser` records it. A segment
 * with an empty or absent `terminator` is reported as having no segment
 * terminator.
 */
const hl7v2LintSegmentTerminator = lintRule<Root>(
  {
    origin: "hl7v2-lint:segment-terminator",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-segment-terminator#readme",
  },
  (tree, file) => {
    visit(tree, "segment", (segment, ancestors) => {
      const terminator = segment.terminator ?? "";
      let reason: string;
      switch (terminator) {
        case CARRIAGE_RETURN: {
          return;
        }
        case "": {
          reason = messages.noTerminator;
          break;
        }
        case LINE_FEED: {
          reason = messages.lineFeed;
          break;
        }
        case CARRIAGE_RETURN_LINE_FEED: {
          reason = messages.carriageReturnLineFeed;
          break;
        }
        default: {
          reason = messages.otherCharacter;
          break;
        }
      }

      // A terminator spans from the segment's end to the start of the next
      // line; a missing one is placed at the segment's end.
      const end = segment.position?.end;
      const place =
        end === undefined || terminator === ""
          ? end
          : {
              end: {
                column: 1,
                line: end.line + 1,
                offset:
                  end.offset === undefined
                    ? undefined
                    : end.offset + terminator.length,
              },
              start: end,
            };
      const message = file.message(reason, {
        ancestors: [...ancestors, segment],
        place,
      });
      message.actual = terminator === "" ? undefined : terminator;
      message.expected = [CARRIAGE_RETURN];
      message.note = notes.segmentTerminator;
    });
  }
);

export default hl7v2LintSegmentTerminator;
