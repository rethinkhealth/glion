import type { Nodes, Root } from "@glion/ast";
import { select, value } from "@glion/util-query";
import { lintRule } from "unified-lint-rule";

/**
 * Source stamped on every message this rule emits (`hl7v2-lint`).
 * `unified-lint-rule` derives it from the part of the origin before the colon.
 * Exported so a consumer — e.g. a server strict-mode gate — can match this
 * rule's diagnostics without hard-coding the literal.
 */
export const HL7V2_LINT_SOURCE = "hl7v2-lint";

/**
 * Rule id stamped on every message this rule emits (`charset`) — the part of
 * the origin after the colon. Exported alongside {@link HL7V2_LINT_SOURCE} so a
 * consumer can identify this rule's diagnostics by `source` + `ruleId`.
 */
export const CHARSET_RULE_ID = "charset";

/**
 * MSH-18 values accepted by default: UTF-8 and its strict 7-bit subsets.
 * `ASCII` (HL7 table 0211 `ascii`, all versions) and `ISO IR6` (table 0211 from
 * v2.7) both name the 7-bit ASCII graphic set — every byte decodes identically
 * as UTF-8 — so a message declaring them, or omitting MSH-18 (which the spec
 * defaults to ASCII), is always safe for the UTF-8 pipeline. Matched
 * case-insensitively after trimming.
 */
export const DEFAULT_ALLOWED_CHARSETS = [
  "UNICODE UTF-8",
  "ASCII",
  "ISO IR6",
] as const;

export interface CharsetLintOptions {
  /**
   * MSH-18 character-set identifiers (HL7 table 0211) to accept, matched
   * case-insensitively after trimming. An empty list falls back to
   * {@link DEFAULT_ALLOWED_CHARSETS}. Default:
   * {@link DEFAULT_ALLOWED_CHARSETS}.
   */
  allow?: readonly string[];
}

const normalize = (charset: string) => charset.trim().toUpperCase();

const hl7v2LintCharset = lintRule<Nodes, CharsetLintOptions>(
  {
    origin: `${HL7V2_LINT_SOURCE}:${CHARSET_RULE_ID}`,
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-charset#readme",
  },
  (tree, file, options) => {
    if (tree.type !== "root") {
      file.message(
        `Root node type must be 'root' — received '${tree.type}' instead`,
        {
          ancestors: [tree],
          place: tree.position,
        }
      );
      return;
    }

    const allowList =
      options?.allow && options.allow.length > 0
        ? options.allow
        : DEFAULT_ALLOWED_CHARSETS;
    const allowed = new Set(allowList.map(normalize));

    const rootTree = tree as Root;
    const field = select(rootTree, "MSH-18");

    // MSH-18 is optional; an absent character set implies the ASCII default,
    // which is UTF-8-compatible, so there is nothing to check.
    if (!field) {
      return;
    }

    // MSH-18 is a repeating field (`UNICODE UTF-8~8859/1`): a single
    // incompatible repetition makes the payload non-UTF-8, so every repetition
    // is checked and each offending one is reported separately.
    const repetitions = field.node.children;
    for (const [index] of repetitions.entries()) {
      const result = value(rootTree, `MSH-18[${index + 1}]`);
      const declared = result?.value;

      // An empty repetition implies the default character set — skip it.
      if (!declared) {
        continue;
      }

      if (!allowed.has(normalize(declared))) {
        file.message(
          `MSH-18 (character set) value '${declared}' is not allowed (allowed: ${allowList.join(", ")})`,
          {
            ancestors: result ? [...result.ancestors, result.node] : [rootTree],
            place:
              result?.node?.position ||
              result?.ancestors.at(-1)?.position ||
              rootTree.position,
          }
        );
      }
    }
  }
);

export default hl7v2LintCharset;
