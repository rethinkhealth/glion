/** Biome-ignore-all lint/performance/noBarrelFile: public API surface */

// Automata engine (unchanged)
export { runner } from "./automata/runner";
export type {
  Definition,
  Effects,
  NFA,
  Runner,
  RunnerEvent,
  RunnerInvalidEvent,
  RunnerStepEvent,
  TransitionMap,
} from "./automata/types";
export { RunnerState } from "./automata/types";

// Profiles API
export { profiles } from "./profiles";

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

// Resolution utility
export { resolveMessageStructure } from "./resolve-message-structure";

// Profiles API types
export type {
  CodeSystemStore,
  EventLoadOptions,
  EventProfileStore,
  ProfileStore,
  Profiles,
} from "./types";
