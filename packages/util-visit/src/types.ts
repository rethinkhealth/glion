import type { Nodes, Segment } from "@glion/ast";
import type { VisitorResult } from "unist-util-visit-parents";

/**
 * Visit information computed for each node.
 * This is HL7v2-specific context not provided by unist-util-visit-parents.
 */
export interface VisitInfo {
  /**
   * 0-based index among the parent's children when the node is visited, or 0
   * for the node the visit starts from. Reflects changes a visitor made to
   * those children earlier in the same visit.
   */
  index: number;

  /** `index` + 1, the HL7v2 sequence number. */
  sequence: number;

  /** 1-based depth in tree (root = 1) */
  depth: number;

  /** Metadata extracted from node (e.g., { name: "MSH" } or { name: "PATIENT" }) */
  metadata: Record<string, unknown> | undefined;

  /**
   * The segment the node is in, or the node itself when it is a segment.
   * `undefined` for a root or group, and for a node below a segment when the
   * visit started below that segment.
   */
  segment: Segment | undefined;

  /**
   * The 1-based sequence of the field the node is in (`5` for any node in
   * `PID-5`), or of the node itself when it is a field. `undefined` above a
   * field, and when the visit started at or below that field.
   */
  field: number | undefined;

  /**
   * The 1-based repetition the node is in (`2` in `PID-5[2]`), on the same
   * terms as `field`.
   */
  repetition: number | undefined;

  /**
   * The 1-based sequence of the component the node is in (`3` in `PID-5.3`),
   * on the same terms as `field`.
   */
  component: number | undefined;

  /**
   * The 1-based sequence of the subcomponent (`1` in `PID-5.3.1`), on the same
   * terms as `field`.
   */
  subcomponent: number | undefined;
}

/**
 * A function called for each node during traversal.
 * Extends unist's visitor signature with HL7v2-specific context.
 *
 * @param node - Current node being visited
 * @param ancestors - Array of ancestor nodes from root to parent
 * @param info - HL7v2-specific visit info (index, sequence, depth, metadata)
 * @returns VisitorResult to control traversal (EXIT, SKIP, etc.)
 */
export type Visitor<T extends Nodes = Nodes> = (
  node: T,
  ancestors: Nodes[],
  info: VisitInfo
) => VisitorResult;

/**
 * Predicate function to test if a node matches filter criteria.
 * Compatible with unist-util-is predicates but uses our Nodes type.
 */
export type Predicate = (node: Nodes, ancestors: Nodes[]) => boolean;

/**
 * Filter criteria to determine which nodes to visit.
 * Based on unist-util-is Test but specialized for HL7v2 AST.
 *
 * Can be:
 *
 * - String: matches `node.type`
 * - Object: matches properties (partial match)
 * - Function: predicate returning boolean or type guard
 * - Null: matches everything
 */
export type Test<T extends Nodes = Nodes> =
  | string
  | Partial<T>
  | ((node: Nodes, ancestors: Nodes[]) => node is T)
  | ((node: Nodes, ancestors: Nodes[]) => boolean)
  | null;
