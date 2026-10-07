import type { Nodes } from "@glion/ast";
import { select, value } from "@glion/util-query";
import { satisfies } from "@glion/util-semver";
import ensureError from "ensure-error";
import { lintRule } from "unified-lint-rule";

export interface MessageVersionLintOptions {
  expression: string;
}

const defaultOptions = {
  expression: "<3.0.0 >=2.3",
} as const;

const messages = {
  emptyVersion:
    "The version in `MSH-12` (Version ID) is empty; a message must declare its HL7v2 version.",
  missingVersion:
    "The message has no `MSH-12` (Version ID); a message must declare its HL7v2 version.",
  notMessage: (kind: string) =>
    `The input is a ${kind}; the version can be read only from \`MSH-12\` (Version ID) of a whole message.`,
  unparsableVersion: (version: string) =>
    `The version in \`MSH-12\` (Version ID) is \`${version}\`; a version must be numbers separated by dots, such as \`2.5\` or \`2.5.1\`.`,
  unsupportedVersion: (version: string, expression: string) =>
    `The version in \`MSH-12\` (Version ID) is \`${version}\`; it must satisfy \`${expression}\`.`,
} as const;

const hl7v2LintMessageVersion = lintRule<Nodes, MessageVersionLintOptions>(
  {
    origin: "hl7v2-lint:message-version",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-message-version#readme",
  },
  (tree, file, opts) => {
    const options = { ...defaultOptions, ...opts };

    if (tree.type !== "root") {
      file.message(messages.notMessage(tree.type), {
        ancestors: [tree],
        place: tree.position,
      });
      return;
    }

    const field = select(tree, "MSH-12");

    if (!field) {
      file.message(messages.missingVersion, {
        ancestors: [tree],
        place: tree.position,
      });
      return;
    }

    const result = value(tree, "MSH-12.1");

    if (!result?.value) {
      const message = file.message(messages.emptyVersion, {
        ancestors: [...field.ancestors, field.node],
        place: field.node.position || field.ancestors.at(-1)?.position,
      });
      message.actual = "";
      return;
    }

    const ancestors = [...result.ancestors, result.node];
    const place =
      result.node.position ||
      result.ancestors.at(-1)?.position ||
      tree.position;

    let isValid = false;
    try {
      isValid = satisfies(result.value, options.expression);
    } catch (caughtError) {
      const message = file.message(messages.unparsableVersion(result.value), {
        ancestors,
        cause: ensureError(caughtError),
        place: result.node.position || tree.position,
      });
      message.actual = result.value;
      return;
    }

    if (!isValid) {
      const message = file.message(
        messages.unsupportedVersion(result.value, options.expression),
        { ancestors, place }
      );
      message.actual = result.value;
      message.expected = [options.expression];
    }
  }
);

export default hl7v2LintMessageVersion;
