/** Biome-ignore-all lint/performance/noBarrelFile: public API surface */

// Message structures
export { matchStructure } from "./structure/match";
export { runner } from "./structure/runner";
export type {
  ChoiceElement,
  GroupElement,
  GroupMatch,
  MessageStructure,
  Occurrence,
  Runner,
  RunnerEvent,
  RunnerInvalidEvent,
  RunnerStepEvent,
  SegmentElement,
  StructureElement,
  StructureMatch,
} from "./structure/types";

// Cache
export { createLruCache } from "./cache/lru";
export type { Cache, CacheOptions } from "./cache/types";

// Profiles API
export { createProfiles, profiles } from "./profiles";

// Segment loader (standalone — not part of the store-based profiles API)
export { loadSegments } from "./stores/segments";

// Store types
export type { ProfileStoreConfig } from "./store";

// Domain types
export type {
  CodeSystemDefinition,
  ComponentProfile,
  DatatypeDefinition,
  DatatypeModule,
  FieldDefinition,
  FieldModule,
  FieldProfile,
  SegmentDefinition,
  SegmentModule,
  SegmentProfile,
  TableCodeEntry,
  TableDefinition,
  TableModule,
  UtgCodeEntry,
  UtgCodeSystemModule,
} from "./stores/types";

// Event maps (version → messageCode_triggerEvent (e.g. "ADT_A04") → canonical structure ID)
export { eventMaps } from "./profiles/event-map-manifest";

// Resolution utilities
export { loadMessageStructure } from "./load-message-structure";
export { resolveMessageStructure } from "./resolve-message-structure";

// Profiles API types
export type {
  CodeSystemStore,
  EventLoadOptions,
  EventProfileStore,
  ProfileStore,
  Profiles,
  ProfilesOptions,
} from "./types";
