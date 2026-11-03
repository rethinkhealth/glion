import type { Root } from "@glion/ast";
import { msh, value } from "@glion/util-query";
import { ENCODING_CHARACTERS } from "@glion/utils";
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
  "HL7v2 declares the component separator, the repetition separator, the escape character, and the subcomponent separator, in that order, as the encoding characters of the message header segment.";

// The message for each delimiter MSH-2 leaves out.
const MISSING = {
  component: messages.noComponentSeparator,
  escape: messages.noEscapeCharacter,
  repetition: messages.noRepetitionSeparator,
  subcomponent: messages.noSubcomponentSeparator,
} as const;

/**
 * Lint rule that reports each delimiter the encoding characters of the message
 * header segment leave out.
 *
 * Reads MSH-2 of the message header segment `msh()` from `@glion/util-query`
 * returns, as `delimiters()` reads it. Reports on MSH-2, or on the message
 * header segment when it has no MSH-2. A message that does not open with a
 * message header segment is not reported.
 */
const hl7v2LintEncodingCharactersRequired = lintRule<Root>(
  {
    origin: "hl7v2-lint:encoding-characters-required",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-encoding-characters-required#readme",
  },
  (tree, file) => {
    const header = msh(tree);
    if (!header) {
      return;
    }
    const msh2 = header.children[1];
    const declared = value(header, "2")?.value ?? "";

    for (const delimiter of ENCODING_CHARACTERS.slice(declared.length)) {
      const message = file.message(MISSING[delimiter], {
        ancestors: msh2 ? [tree, header, msh2] : [tree, header],
        place: (msh2 ?? header).position,
      });
      message.note = note;
    }
  }
);

export default hl7v2LintEncodingCharactersRequired;
