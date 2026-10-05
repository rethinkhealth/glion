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

// Domain types
export type {
  CodeSystemDefinition,
  CodeSystemStore,
  UtgCodeEntry,
  UtgCodeSystemModule,
} from "./stores/code-systems";
export type {
  ComponentProfile,
  DatatypeDefinition,
  DatatypeModule,
} from "./stores/datatypes";
export type {
  FieldDefinition,
  FieldModule,
  FieldProfile,
} from "./stores/fields";
export type {
  SegmentDefinition,
  SegmentModule,
  SegmentProfile,
} from "./stores/segments";
export type {
  TableCodeEntry,
  TableDefinition,
  TableModule,
} from "./stores/tables";

// Event maps (version → messageCode_triggerEvent (e.g. "ADT_A04") → canonical structure ID)
export { eventMaps } from "./event-maps";

// Resolution utility
export { resolveMessageStructure } from "./resolve-message-structure";

// Profiles API types
export type { ProfileStore, Profiles } from "./profiles";
