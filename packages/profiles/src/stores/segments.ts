import { memoize } from "../memoize";

/** The raw segments of a version, as `segments.json` holds them. */
export type SegmentModule = Readonly<{
  segments: readonly SegmentProfile[];
}>;

/** Segment metadata from the HL7v2 specification. */
export type SegmentProfile = Readonly<{
  id: string;
  title: string;
}>;

/**
 * Compiled segment definition for a version.
 * Returned by `loadSegments()`.
 */
export type SegmentDefinition = Readonly<{
  /** O(1) lookup of segment profile by segment ID (e.g., "MSH", "PID"). */
  byId: ReadonlyMap<string, SegmentProfile>;
}>;

const segmentFiles = import.meta.glob<SegmentModule>(
  "../profiles/v*/segments.json",
  { import: "default" }
);

const index = memoize((raw: SegmentModule): SegmentDefinition => {
  const byId = new Map<string, SegmentProfile>();

  for (const segment of raw.segments) {
    byId.set(segment.id, segment);
  }

  return { byId };
});

/**
 * Load and compile all segment definitions for an HL7v2 version.
 *
 * Later loads of the same version resolve the same value.
 *
 * @throws {Error} When `version` is not bundled.
 */
export const loadSegments = async (
  version: string
): Promise<SegmentDefinition> => {
  const importSegments = segmentFiles[`../profiles/v${version}/segments.json`];
  if (!importSegments) {
    throw new Error(`Unknown segments profile: v${version}`);
  }
  return index(await importSegments());
};
