import { loaderByVersion } from "./load";
import type { FieldDefinition, SegmentFieldsEntry } from "./types";

const compileSegment = ({
  segmentId,
  fields,
}: SegmentFieldsEntry): FieldDefinition => ({
  bySequence: new Map(fields.map((field) => [field.sequence, field])),
  requiredSequences: new Set(
    fields.filter((field) => field.required).map((field) => field.sequence)
  ),
  segmentId,
});

/**
 * The field definitions of every segment in an HL7v2 version, by segment ID,
 * or `undefined` for a version not bundled.
 */
export const loadFields: (
  version: string
) => Promise<ReadonlyMap<string, FieldDefinition> | undefined> =
  loaderByVersion(
    import.meta.glob<readonly SegmentFieldsEntry[]>(
      "../profiles/v*/fields.json",
      { import: "default" }
    ),
    (segments) =>
      new Map(
        segments.map((segment) => [segment.segmentId, compileSegment(segment)])
      )
  );
