import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import hl7v2LintExtraComponents from "@glion/lint-profile-extra-components";
import hl7v2LintExtraFields from "@glion/lint-profile-extra-fields";
import hl7v2LintFieldMaxLength from "@glion/lint-profile-field-max-length";
import hl7v2LintFieldRepetition from "@glion/lint-profile-field-repetition";
import hl7v2LintRequiredComponents from "@glion/lint-profile-required-components";
import hl7v2LintRequiredFields from "@glion/lint-profile-required-fields";
import hl7v2LintSegmentOrder from "@glion/lint-profile-segment-order";
import hl7v2LintTableValues from "@glion/lint-profile-table-values";
import type { Preset } from "unified";

/**
 * Preset of profile-based hl7v2-lint rules.
 *
 * Validates HL7v2 messages against field definitions, datatype definitions,
 * and table definitions from the HL7v2 profiles.
 *
 * ## Rules included
 *
 * - **required-fields** — validates required fields are present and non-empty
 * - **field-max-length** — validates field value lengths against maxLength
 * - **field-repetition** — flags non-repeatable fields with multiple repetitions
 * - **required-components** — validates required components in composite
 *   datatypes
 * - **table-values** — validates coded values against HL7-type tables
 * - **extra-fields** — warns when segments have fields beyond the profile maximum
 * - **extra-components** — warns when composite fields have components beyond the
 *   datatype maximum
 * - **segment-order** — validates segment order against event schema profiles
 *
 * All rules read the HL7v2 version from MSH-12 and load profiles accordingly.
 * Unknown segments (Z-segments) are silently skipped.
 *
 * ## Usage
 *
 * ```typescript
 * import { unified } from "unified";
 * import { hl7v2Parser } from "@glion/parser";
 * import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
 *
 * const processor = unified()
 *   .use(hl7v2Parser)
 *   .use(hl7v2PresetLintProfileRecommended);
 * ```
 *
 * Rules can be reconfigured individually after applying the preset.
 */
const hl7v2PresetLintProfileRecommended: Preset = {
  plugins: [
    hl7v2AnnotateProfileContext,
    hl7v2LintRequiredFields,
    hl7v2LintFieldMaxLength,
    hl7v2LintFieldRepetition,
    hl7v2LintRequiredComponents,
    hl7v2LintTableValues,
    hl7v2LintExtraFields,
    hl7v2LintExtraComponents,
    hl7v2LintSegmentOrder,
  ],
};

export default hl7v2PresetLintProfileRecommended;
