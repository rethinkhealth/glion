import type { SegmentDefinition, SegmentModule, SegmentProfile } from "./types";

// ---------------------------------------------------------------------------
// Manifest — lazy imports keyed by HL7v2 version
// ---------------------------------------------------------------------------

type SegmentImportFactory = () => Promise<SegmentModule>;

const manifest: Record<string, SegmentImportFactory> = {
  "v2.1": () => import("../profiles/v2.1/segments"),
  "v2.2": () => import("../profiles/v2.2/segments"),
  "v2.3": () => import("../profiles/v2.3/segments"),
  "v2.3.1": () => import("../profiles/v2.3.1/segments"),
  "v2.4": () => import("../profiles/v2.4/segments"),
  "v2.5": () => import("../profiles/v2.5/segments"),
  "v2.5.1": () => import("../profiles/v2.5.1/segments"),
  "v2.6": () => import("../profiles/v2.6/segments"),
  "v2.7": () => import("../profiles/v2.7/segments"),
  "v2.7.1": () => import("../profiles/v2.7.1/segments"),
  "v2.8": () => import("../profiles/v2.8/segments"),
  "v2.8.1": () => import("../profiles/v2.8.1/segments"),
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

const loaded = new Map<string, Promise<SegmentDefinition>>();

/**
 * The segment definitions of an HL7v2 version, or `undefined` for a version
 * not bundled.
 *
 * Each version loads and compiles once; later calls return the same
 * definition.
 */
export const loadSegments = async (
  version: string
): Promise<SegmentDefinition | undefined> => {
  let segments = loaded.get(version);
  if (!segments) {
    const factory = manifest[`v${version}`];
    if (!factory) {
      return undefined;
    }
    segments = (async () => compile(await factory()))();
    loaded.set(version, segments);
  }
  return await segments;
};
