import { loaderByVersion } from "./load";
import type { SegmentDefinition, SegmentProfile } from "./types";

/**
 * The segment definitions of an HL7v2 version, or `undefined` for a version
 * not bundled.
 */
export const loadSegments: (
  version: string
) => Promise<SegmentDefinition | undefined> = loaderByVersion(
  import.meta.glob<readonly SegmentProfile[]>("../profiles/v*/segments.json", {
    import: "default",
  }),
  (segments) => ({
    byId: new Map(segments.map((segment) => [segment.id, segment])),
  })
);
