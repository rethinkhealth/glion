import type {
  Component,
  Field,
  FieldRepetition,
  Group,
  Nodes,
  Segment,
  Subcomponent,
} from "@glion/ast";

export interface GroupLocator {
  name: string;
  repetition?: number;
}

export interface SegmentLocator {
  name: string;
  repetition?: number;
}

export interface PathParts {
  groups?: GroupLocator[];
  segment: SegmentLocator;
  field?: number;
  repetition?: number;
  component?: number;
  subcomponent?: number;
}

/**
 * Helper type to check if a string represents a number
 */
type IsNumber<T extends string> = T extends `${number}` ? true : false;

/**
 * Helper type to extract field number before brackets (e.g., "4[1]" -> "4")
 */
type ExtractFieldNumber<T extends string> = T extends `${infer Num}[${string}]`
  ? Num
  : T;

/**
 * Helper type to extract the last part after the final hyphen
 */
type LastPart<Path extends string> =
  Path extends `${infer _Before}-${infer After}`
    ? LastPart<After> // Recursively check for more hyphens
    : Path;

/**
 * Infer the exact node type from an HL7 path string at compile time.
 *
 * Uses template literal types to parse path structure and return the
 * corresponding AST node type. Patterns are checked from most specific
 * to least specific to ensure correct matching.
 *
 * @example
 *   ```typescript
 *   // No field access = could be Segment OR Group (AST determines which)
 *   type T1 = InferNodeType<"PID">; // Segment | Group
 *   type T2 = InferNodeType<"ORDER">; // Segment | Group
 *   type T3 = InferNodeType<"ORDER-OBR">; // Segment | Group
 *
 *   // Field access (has -N where N is a number) = definitively segment internals
 *   type T4 = InferNodeType<"PID-5">; // Field
 *   type T5 = InferNodeType<"PID-5[1]">; // FieldRepetition
 *   type T6 = InferNodeType<"PID-5.2">; // Component
 *   type T7 = InferNodeType<"PID-5[1].2">; // Component
 *   type T8 = InferNodeType<"PID-5.2.1">; // Subcomponent
 *   type T9 = InferNodeType<"PID-4[1].1.1">; // Subcomponent (with repetition)
 *   type T10 = InferNodeType<"ORDER-OBR-5">; // Field (has field number = OBR is segment)
 *
 *   // Key insight: Field access tells us it's definitively a segment
 *   // - No field access: Could be segment or group → Segment | Group
 *   // - Has field access (-N): Must be a segment → Field/Component/Subcomponent
 *   ```;
 */
export type InferNodeType<Path extends string> =
  // When Path is the broad `string` type (not a literal), return all possible node types
  string extends Path
    ? Nodes
    : // Check most specific patterns first (subcomponents)
      Path extends `${string}-${infer FieldPart}.${string}.${string}`
      ? IsNumber<ExtractFieldNumber<FieldPart>> extends true
        ? Subcomponent
        : Segment | Group
      : Path extends `${string}-${infer FieldPart}[${string}].${string}.${string}`
        ? IsNumber<ExtractFieldNumber<FieldPart>> extends true
          ? Subcomponent
          : Segment | Group
        : // Components (one dot after field)
          Path extends `${string}-${infer FieldPart}.${string}`
          ? IsNumber<ExtractFieldNumber<FieldPart>> extends true
            ? Component
            : Segment | Group
          : Path extends `${string}-${infer FieldPart}[${string}].${string}`
            ? IsNumber<ExtractFieldNumber<FieldPart>> extends true
              ? Component
              : Segment | Group
            : // Field repetitions (brackets, no dots after)
              Path extends `${string}-${infer FieldPart}[${string}]`
              ? IsNumber<ExtractFieldNumber<FieldPart>> extends true
                ? FieldRepetition
                : Segment | Group
              : // Fields vs Segments/Groups: Check if last part after hyphen is a number
                Path extends `${string}-${infer Last}`
                ? IsNumber<ExtractFieldNumber<LastPart<Last>>> extends true
                  ? Field
                  : Segment | Group
                : // No hyphen at all, could be segment or group
                  Segment | Group;
