import type { Root } from "@glion/ast";
import { delimiters, select } from "@glion/util-query";
import { lintRule } from "unified-lint-rule";

const messages = {
  sameCharacter: (delimiter: string, earlier: string) =>
    `The ${delimiter} is the same character as the ${earlier}.`,
} as const;

const note =
  "HL7v2 gives each delimiter its own character, so that a value is told apart from the delimiters around it and from its escape sequences.";

// The delimiters MSH-1 and MSH-2 declare, in order, each with its name.
const DELIMITERS = [
  { delimiter: "field", name: "field separator" },
  { delimiter: "component", name: "component separator" },
  { delimiter: "repetition", name: "repetition separator" },
  { delimiter: "escape", name: "escape character" },
  { delimiter: "subcomponent", name: "subcomponent separator" },
] as const;

/**
 * Lint rule that reports a delimiter of the message header segment that is the
 * same character as an earlier one.
 *
 * Reads MSH-1 and MSH-2 of the message header segment the message opens with,
 * as `delimiters()` from `@glion/util-query` reads them. Reports on MSH-2, or
 * on the message header segment when it has no MSH-2. A message that does not
 * open with a message header segment is not reported.
 */
const hl7v2LintDelimitersDuplicate = lintRule<Root>(
  {
    origin: "hl7v2-lint:delimiters-duplicate",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-delimiters-duplicate#readme",
  },
  (tree, file) => {
    const header = select(tree, "MSH");
    if (!header) {
      return;
    }
    const { ancestors, node } = select(tree, "MSH.2") ?? header;

    const declared = delimiters(tree);
    // A delimiter is reported once, against the first delimiter with its
    // character: `^~^^` reports the escape character and the subcomponent
    // separator, each as the same character as the component separator.
    for (const [i, { delimiter, name }] of DELIMITERS.entries()) {
      const ch = declared[delimiter];
      const earlier = DELIMITERS.slice(0, i).find(
        (other) => ch !== undefined && declared[other.delimiter] === ch
      );
      if (earlier) {
        const message = file.message(
          messages.sameCharacter(name, earlier.name),
          { ancestors: [...ancestors, node], place: node.position }
        );
        message.actual = ch;
        message.note = note;
      }
    }
  }
);

export default hl7v2LintDelimitersDuplicate;
