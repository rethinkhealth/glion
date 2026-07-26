import type { Nodes } from "@glion/ast";
import { select } from "@glion/util-query";
import { lintRule } from "unified-lint-rule";

/**
 * MSH-18 values accepted by default: UTF-8 and its strict 7-bit subsets.
 * `ASCII` (HL7 table 0211 `ascii`, all versions) and `ISO IR6` (table 0211 from
 * v2.7) both name the 7-bit ASCII graphic set — every byte decodes identically
 * as UTF-8 — so a message declaring them, or omitting MSH-18 (which the spec
 * defaults to ASCII), is always safe for the UTF-8 pipeline. Matched
 * case-insensitively after trimming.
 */
const DEFAULT_ALLOWED_CHARSETS = ["UNICODE UTF-8", "ASCII", "ISO IR6"] as const;

export interface CharsetLintOptions {
  /**
   * MSH-18 character-set identifiers (HL7 table 0211) to accept, matched
   * case-insensitively after trimming. An empty list falls back to the default
   * (`UNICODE UTF-8`, `ASCII`, `ISO IR6`).
   */
  allow?: readonly string[];
  /**
   * Require MSH-18 to declare a character set. When `true`, a message that
   * omits MSH-18 (or leaves it empty) is reported instead of being allowed to
   * fall back to the ASCII default. Default: `false`.
   */
  required?: boolean;
}

const normalize = (charset: string) => charset.trim().toUpperCase();

const hl7v2LintCharset = lintRule<Nodes, CharsetLintOptions>(
  {
    origin: "hl7v2-lint:charset",
    url: "https://github.com/rethinkhealth/glion/tree/main/packages/lint-charset#readme",
  },
  (tree, file, options) => {
    // Only a full message has an MSH-18 to check; ignore anything else.
    if (tree.type !== "root") {
      return;
    }

    const allowList =
      options?.allow && options.allow.length > 0
        ? options.allow
        : DEFAULT_ALLOWED_CHARSETS;
    const allowed = new Set(allowList.map(normalize));

    const field = select(tree, "MSH-18");
    let declared = false;

    // MSH-18 is a repeating field (`UNICODE UTF-8~8859/1`): a single
    // incompatible repetition makes the payload non-UTF-8, so every repetition
    // is checked and each offending one is reported against its own node.
    if (field) {
      for (const repetition of field.node.children) {
        const charset = repetition.children?.[0]?.children?.[0]?.value;

        // An empty repetition implies the default character set — skip it.
        if (!charset) {
          continue;
        }

        declared = true;
        if (!allowed.has(normalize(charset))) {
          file.message(
            `MSH-18 (character set) value '${charset}' is not allowed (allowed: ${allowList.join(", ")})`,
            {
              ancestors: [...field.ancestors, field.node, repetition],
              place: repetition.position ?? field.node.position,
            }
          );
        }
      }
    }

    if (options?.required && !declared) {
      const segment = select(tree, "MSH");
      file.message("MSH-18 (character set) is required but not declared", {
        ancestors: segment ? [...segment.ancestors, segment.node] : [tree],
        place: segment?.node.position ?? tree.position,
      });
    }
  }
);

export default hl7v2LintCharset;
