import type { Delimiters, Root } from "@glion/ast";
import { delimiters, msh, select } from "@glion/util-query";
import { lintRule } from "unified-lint-rule";

const messages = {
  noComponentSeparator:
    "The encoding characters declare no component separator.",
  noEscapeCharacter: "The encoding characters declare no escape character.",
  noRepetitionSeparator:
    "The encoding characters declare no repetition separator.",
  noSubcomponentSeparator:
    "The encoding characters declare no subcomponent separator.",
} as const;

const note =
  "HL7v2 declares the component separator, the repetition separator, the escape character, and the subcomponent separator, in that order, as the encoding characters of the message header segment. A message may leave out the escape character only when it holds no escape sequences, and the subcomponent separator only when it holds no subcomponents.";

// The encoding characters MSH-2 declares, in order, each with the message for
// one it leaves out.
const ENCODING_CHARACTERS = [
  { delimiter: "component", missing: messages.noComponentSeparator },
  { delimiter: "repetition", missing: messages.noRepetitionSeparator },
  { delimiter: "escape", missing: messages.noEscapeCharacter },
  { delimiter: "subcomponent", missing: messages.noSubcomponentSeparator },
] as const;

/**
 * Lint rule that reports each delimiter the encoding characters of the message
 * header segment leave out.
 *
 * Reads MSH-2 of the message header segment the message opens with, as
 * `delimiters()` from `@glion/util-query` reads it. Reports on MSH-2, or on the
 * message header segment when it has no MSH-2. A message that does not open
 * with a message header segment is not reported.
 */
const hl7v2LintEncodingCharactersRequired = lintRule<Root>(
  {
    origin: "hl7v2-lint:encoding-characters-required",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-encoding-characters-required#readme",
  },
  (tree, file) => {
    const header = select(tree, "MSH");
    if (!header || header.node !== msh(tree)) {
      return;
    }
    const { ancestors, node } = select(tree, "MSH.2") ?? header;

    const declared: Partial<Delimiters> =
      header.node.children.length > 0 ? delimiters(tree) : {};
    for (const { delimiter, missing } of ENCODING_CHARACTERS) {
      if (declared[delimiter] === undefined) {
        const message = file.message(missing, {
          ancestors: [...ancestors, node],
          place: node.position,
        });
        message.note = note;
      }
    }
  }
);

export default hl7v2LintEncodingCharactersRequired;
