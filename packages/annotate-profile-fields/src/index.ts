// oxlint-disable-next-line no-unused-vars -- triggers VFile DataMap augmentation
import type { ProfileContext } from "@glion/annotate-profile-context";
import type { FieldData, Root, Segment } from "@glion/ast";
import type { FieldProfile } from "@glion/profiles";
import { SKIP, visit } from "@glion/util-visit";
import type { Plugin } from "unified";
import type { VFile } from "vfile";

declare module "@glion/ast" {
  interface FieldData {
    /** Field identifier (e.g., "MSH-9", "PID-3"). */
    id?: string | undefined;
    /** Human-readable field name from the profile (e.g., "Patient Name"). */
    name?: string | undefined;
    /** Whether this field is required in the segment. */
    required?: boolean | undefined;
    /** Whether this field supports repetition. */
    repeatable?: boolean | undefined;
    /** Datatype ID for this field (e.g., "XPN", "ST", "CWE"). */
    datatype?: string | undefined;
    /** Maximum allowed length for this field. */
    maxLength?: number | undefined;
    /** Table reference for coded fields (e.g., "HL70001"). */
    table?: string | undefined;
    /** HL7 specification item number. */
    item?: string | undefined;
  }
}

/**
 * Unified plugin that annotates Field nodes with profile metadata.
 *
 * Reads field definitions from `file.data.fields` (populated by
 * `@glion/annotate-profile-context`) and spreads the profile
 * properties directly onto each `field.data`.
 *
 * Unknown segments (Z-segments) and unsupported versions are silently skipped.
 */
export const hl7v2AnnotateProfileFields: Plugin<[], Root, Root> =
  () => (tree: Root, file: VFile) => {
    const ctx = file.data.profile;
    if (!ctx) {
      return tree;
    }

    // Annotate each field with its profile
    visit(tree, "field", (node, ancestors, info) => {
      const segment = ancestors.at(-1) as Segment | undefined;
      if (segment?.type !== "segment") {
        return SKIP;
      }

      const profile = ctx.fields
        .get(segment.name)
        ?.bySequence.get(info.sequence);
      if (!profile) {
        return SKIP;
      }

      if (!node.data) {
        node.data = {};
      }

      spreadFieldProfile(node.data, profile);
      return SKIP;
    });

    return tree;
  };

function spreadFieldProfile(data: FieldData, profile: FieldProfile): void {
  data.id = profile.id;
  data.name = profile.name;
  data.required = profile.required;
  data.repeatable = profile.repeatable;
  if (profile.datatype !== undefined) {
    data.datatype = profile.datatype;
  }
  if (profile.maxLength !== undefined) {
    data.maxLength = profile.maxLength;
  }
  if (profile.table !== undefined) {
    data.table = profile.table;
  }
  if (profile.item !== undefined) {
    data.item = profile.item;
  }
}

export default hl7v2AnnotateProfileFields;
