import type { Root } from "@glion/ast";
import { delimiters, msh } from "@glion/util-query";
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
 * Reads MSH-1 and MSH-2 of the message header segment `msh()` from
 * `@glion/util-query` returns, as `delimiters()` reads them, and reports on
 * MSH-2. A message that does not open with a message header segment is not
 * reported.
 */
const hl7v2LintDelimitersDuplicate = lintRule<Root>(
  {
    origin: "hl7v2-lint:delimiters-duplicate",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-delimiters-duplicate#readme",
  },
  (tree, file) => {
    const header = msh(tree);
    const msh2 = header?.children[1];
    // Stryker disable next-line ConditionalExpression,LogicalOperator,BlockStatement: without MSH-2 the only delimiter declared is the field separator, so this return only skips the work
    if (!header || !msh2) {
      return;
    }
    const declared = delimiters(tree);

    // The first delimiter with each character. `^~^^` reports the escape
    // character and the subcomponent separator, each against the component
    // separator.
    const first = new Map<string, string>();
    for (const { delimiter, name } of DELIMITERS) {
      const ch = declared[delimiter];
      if (ch === undefined) {
        continue;
      }
      const earlier = first.get(ch);
      if (earlier === undefined) {
        first.set(ch, name);
      } else {
        const message = file.message(messages.sameCharacter(name, earlier), {
          ancestors: [tree, header, msh2],
          place: msh2.position,
        });
        message.actual = ch;
        message.note = note;
      }
    }
  }
);

export default hl7v2LintDelimitersDuplicate;
