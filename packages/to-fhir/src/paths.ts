// oxlint-disable-next-line no-unused-vars -- triggers FieldData augmentation
import type { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import type {
  Component,
  Field,
  FieldRepetition,
  Group,
  Nodes,
  Root,
  Segment,
} from "@glion/ast";

import type { Leaf } from "./types";

/** Every node's canonical path, every populated leaf, and every group instance. */
export interface PathIndex {
  /** The canonical path of any node in the tree. */
  pathOf: (node: Nodes) => string | undefined;
  leaves: Leaf[];
  /** Every Segment ID the message carries. */
  segmentNames: Set<string>;
  /** Group instances, keyed by their group path without instance indices. */
  scopes: Map<string, { node: Root | Group; path: string }[]>;
}

const isGroup = (node: Nodes): node is Group => node.type === "group";
const isSegment = (node: Nodes): node is Segment => node.type === "segment";

const SCOPE_STEP = /^([A-Z][A-Z0-9_]*)\[(\d+)]$/;

/** One `NAME[n]` step of a group path. */
export interface ScopeStep {
  name: string;
  repetition: number;
}

/**
 * The steps of a group path.
 *
 * An empty path has no steps and names the message itself.
 *
 * @throws {Error} On a step that is not `NAME[n]`.
 */
export function scopeSteps(path: string): ScopeStep[] {
  if (path === "") {
    return [];
  }
  return path.split(".").map((step) => {
    const parsed = SCOPE_STEP.exec(step);
    // Stryker disable next-line ConditionalExpression,BlockStatement,StringLiteral: every path compared here is one indexPaths built, so this guard never fires
    if (!parsed) {
      throw new Error(
        `Group path \`${path}\` has the step \`${step}\`, which does not name a group instance; this is a bug in @glion/to-fhir, please report it.`
      );
    }
    return {
      name: parsed[1] as string,
      repetition: Number(parsed[2]),
    };
  });
}

/**
 * Whether `ancestor` is `scope` or encloses it.
 *
 * Compared step by step: `PATIENT[1]` does not enclose `PATIENT[10]`.
 */
export function encloses(ancestor: string, scope: string): boolean {
  const outer = scopeSteps(ancestor);
  const inner = scopeSteps(scope);
  if (outer.length > inner.length) {
    return false;
  }
  return outer.every((step, position) => {
    const against = inner[position] as ScopeStep;
    return step.name === against.name && step.repetition === against.repetition;
  });
}

/**
 * Whether the leaf is a delimiter declaration rather than content.
 *
 * MSH-1 (Field Separator) and MSH-2 (Encoding Characters) carry the delimiters
 * the rest of the message is encoded with.
 */
export function isDelimiterLeaf(leaf: Leaf): boolean {
  return leaf.segment === "MSH" && (leaf.sequence === 1 || leaf.sequence === 2);
}

/**
 * Assign every node its canonical path, and collect the populated leaves.
 *
 * A leaf's path and a path a rule reads are produced here from the same walk,
 * so a path that was read is comparable to a path that holds a value.
 *
 * @param root - The grouped, field-annotated tree.
 */
export function indexPaths(root: Root): PathIndex {
  const paths = new Map<Nodes, string>();
  const leaves: Leaf[] = [];
  const segmentNames = new Set<string>();
  const scopes = new Map<string, { node: Group | Root; path: string }[]>();

  const addScope = (key: string, node: Group | Root, path: string): void => {
    const list = scopes.get(key) ?? [];
    list.push({ node, path });
    scopes.set(key, list);
  };

  const walkComponent = (
    component: Component,
    prefix: string,
    of: { field: Field; segment: Segment; sequence: number }
  ): void => {
    paths.set(component, prefix);
    for (const [position, sub] of component.children.entries()) {
      const path = `${prefix}.${position + 1}`;
      paths.set(sub, path);
      if (sub.value !== "") {
        leaves.push({
          name: of.field.data?.name,
          node: sub,
          path,
          segment: of.segment.name,
          sequence: of.sequence,
          value: sub.value,
        });
      }
    }
  };

  const walkRepetition = (
    repetition: FieldRepetition,
    prefix: string,
    of: { field: Field; segment: Segment; sequence: number }
  ): void => {
    paths.set(repetition, prefix);
    for (const [position, component] of repetition.children.entries()) {
      walkComponent(component, `${prefix}.${position + 1}`, of);
    }
  };

  const walkField = (
    field: Field,
    prefix: string,
    of: { segment: Segment; sequence: number }
  ): void => {
    paths.set(field, prefix);
    const only = field.children.length === 1;
    for (const [position, repetition] of field.children.entries()) {
      // A field with one repetition is addressed without an index.
      const path = only ? prefix : `${prefix}[${position + 1}]`;
      walkRepetition(repetition, path, { ...of, field });
    }
  };

  const walkSegment = (segment: Segment, prefix: string): void => {
    paths.set(segment, prefix);
    segmentNames.add(segment.name);
    for (const [position, field] of segment.children.entries()) {
      const sequence = field.data?.sequence ?? position + 1;
      walkField(field, `${prefix}.${sequence}`, { segment, sequence });
    }
  };

  /** How many times each Segment ID appears directly in the container. */
  const segmentTotals = (container: Group | Root): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const child of container.children) {
      if (isSegment(child)) {
        totals.set(child.name, (totals.get(child.name) ?? 0) + 1);
      }
    }
    return totals;
  };

  const walkScope = (
    container: Group | Root,
    prefix: string,
    key: string
  ): void => {
    const totals = segmentTotals(container);
    const seen = new Map<string, number>();
    const step = (name: string, indexed: boolean): string => {
      const n = (seen.get(name) ?? 0) + 1;
      seen.set(name, n);
      const label = indexed ? `${name}[${n}]` : name;
      return prefix === "" ? label : `${prefix}.${label}`;
    };

    for (const child of container.children) {
      if (isGroup(child)) {
        const childPrefix = step(child.id, true);
        const childKey = key === "" ? child.id : `${key}.${child.id}`;
        paths.set(child, childPrefix);
        addScope(childKey, child, childPrefix);
        walkScope(child, childPrefix, childKey);
        continue;
      }
      if (isSegment(child)) {
        walkSegment(child, step(child.name, (totals.get(child.name) ?? 1) > 1));
      }
    }
  };

  addScope("", root, "");
  walkScope(root, "", "");

  return { leaves, pathOf: (node) => paths.get(node), scopes, segmentNames };
}
