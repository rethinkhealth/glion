import { memoize } from "../utils";
import { lazyImport } from "./utils";

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
 * Resolves `undefined` when `version` is not bundled. Later loads of the same
 * version resolve the same value.
 *
 * @throws {Error} When a bundled version's segments fail to load.
 */
export const loadSegments = async (
  version: string
): Promise<SegmentDefinition | undefined> => {
  const raw = await lazyImport<SegmentModule>(
    `../profiles/v${version}/segments.json`
  );
  return raw === undefined ? undefined : index(raw);
};
