import hl7v2LintCharset from "@glion/lint-charset";
import hl7v2LintMessageVersion from "@glion/lint-message-version";
import hl7v2LintNoTrailingEmptyField from "@glion/lint-no-trailing-empty-field";
import hl7v2LintRequiredMessageHeader from "@glion/lint-required-message-header";
import hl7v2LintSegmentHeaderLength from "@glion/lint-segment-header-length";
import type { Preset } from "unified";

/**
 * Preset of hl7v2-lint rules to warn for likely problems.
 *
 * ## What is this?
 *
 * This package is a preset containing `hl7v2-lint` rules.
 * Lint rules check hl7v2 basic rules.
 *
 * ## When should I use this?
 *
 * You can use this package to check that hl7v2 follows some best practices.
 *
 * ## API
 *
 * ### `unified().use(hl7v2PresetLintRecommended)`
 *
 * Check that hl7v2 follows some best practices.
 *
 * You can reconfigure rules in the preset by using them afterwards with
 * different options.
 */
const hl7v2PresetLintRecommended: Preset = {
  plugins: [
    // segment linting rules
    [hl7v2LintSegmentHeaderLength, ["error"]],
    [hl7v2LintRequiredMessageHeader, ["error"]],
    [hl7v2LintMessageVersion, ["error"]],
    [hl7v2LintCharset, ["error"]],
    hl7v2LintNoTrailingEmptyField,
  ],
};

export default hl7v2PresetLintRecommended;
