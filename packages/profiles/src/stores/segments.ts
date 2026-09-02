import type { SegmentDefinition, SegmentModule, SegmentProfile } from "./types";

// ---------------------------------------------------------------------------
// Manifest — lazy imports keyed by HL7v2 version
// ---------------------------------------------------------------------------

type SegmentImportFactory = () => Promise<SegmentModule>;

const manifest: Record<string, SegmentImportFactory> = {
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.1": () => import("../profiles/v2.1/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.2": () => import("../profiles/v2.2/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.3": () => import("../profiles/v2.3/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.3.1": () => import("../profiles/v2.3.1/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.4": () => import("../profiles/v2.4/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.5": () => import("../profiles/v2.5/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.5.1": () => import("../profiles/v2.5.1/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.6": () => import("../profiles/v2.6/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.7": () => import("../profiles/v2.7/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.7.1": () => import("../profiles/v2.7.1/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.8": () => import("../profiles/v2.8/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.8.1": () => import("../profiles/v2.8.1/segments"),
  // @ts-expect-error — Resolved by bundler; tsc build excludes profile data for performance
  "v2.8.2": () => import("../profiles/v2.8.2/segments"),
};

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

/** Compile raw segment module into indexed definition. */
const compile = (raw: SegmentModule): SegmentDefinition => {
  const byId = new Map<string, SegmentProfile>();

  for (const segment of raw.segments) {
    byId.set(segment.id, segment);
  }

  return { byId };
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load and compile all segment definitions for an HL7v2 version.
 *
 * Segment definitions are small (just id + title per segment) and are
 * loaded all-at-once per version via a single lazy import. The ES module
 * runtime caches the dynamic import, so repeated calls for the same
 * version don't re-fetch the module.
 *
 * @throws When the version is not in the manifest.
 */
export const loadSegments = async (
  version: string
): Promise<SegmentDefinition> => {
  const factory = manifest[`v${version}`];
  if (!factory) {
    throw new Error(`Unknown segments profile: v${version}`);
  }
  const raw = await factory();
  return compile(raw);
};
