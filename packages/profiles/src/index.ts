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

// Loaders
export { loadCodeSystems } from "./loaders/code-systems";
export { loadDatatypes } from "./loaders/datatypes";
export { loadFields } from "./loaders/fields";
export { loadMessageStructures } from "./loaders/message-structures";
export { loadSegments } from "./loaders/segments";
export { loadTables } from "./loaders/tables";

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
} from "./loaders/types";

// Event maps (version → messageCode_triggerEvent (e.g. "ADT_A04") → canonical structure ID)
export { eventMaps } from "./profiles/event-map-manifest";

// Resolution utilities
export { loadMessageStructure } from "./load-message-structure";
export { resolveMessageStructure } from "./resolve-message-structure";
