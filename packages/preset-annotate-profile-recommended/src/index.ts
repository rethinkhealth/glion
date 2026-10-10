import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileDatatypes } from "@glion/annotate-profile-datatypes";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { hl7v2AnnotateProfileFieldsCodeSystems } from "@glion/annotate-profile-fields-code-systems";
import { hl7v2AnnotateProfileSegments } from "@glion/annotate-profile-segments";
import type { Preset } from "unified";

/**
 * Preset of profile-based HL7v2 annotation plugins.
 *
 * Enriches HL7v2 AST nodes with metadata from the HL7v2 profiles:
 *
 * - **segments** — annotates Segment nodes with their human-readable title from
 *   the HL7v2 specification (e.g., MSH → "Message Header")
 * - **fields** — annotates Field nodes with name, optionality, repetitions,
 *   datatype, etc.
 * - **datatypes** — annotates FieldRepetition, Component, and Subcomponent nodes
 *   with datatype kind/title using a stop-at-primitive cascade
 * - **fields-code-systems** — annotates coded Fields with UTG code system
 *   identity and each FieldRepetition with the resolved value (display,
 *   status)
 *
 * All plugins read the HL7v2 version from MSH-12 and load profiles accordingly.
 * Unknown segments (Z-segments) are silently skipped.
 *
 * @example
 *   ```typescript
 *   import { unified } from "unified";
 *   import { hl7v2Parser } from "@glion/parser";
 *   import hl7v2PresetAnnotateProfileRecommended from "@glion/preset-annotate-profile-recommended";
 *
 *   const processor = unified()
 *     .use(hl7v2Parser)
 *     .use(hl7v2PresetAnnotateProfileRecommended);
 *   ```;
 */
const hl7v2PresetAnnotateProfileRecommended: Preset = {
  plugins: [
    hl7v2AnnotateProfileContext,
    hl7v2AnnotateProfileSegments,
    hl7v2AnnotateProfileFields,
    hl7v2AnnotateProfileDatatypes,
    hl7v2AnnotateProfileFieldsCodeSystems,
  ],
};

export default hl7v2PresetAnnotateProfileRecommended;
