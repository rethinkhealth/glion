// -------------
// Internal Helpers
// -------------

import type {
  Component,
  Field,
  FieldRepetition,
  Group,
  Nodes,
  Root,
  Segment,
  Subcomponent,
} from "@glion/ast";

import type { GroupLocator, PathParts } from "./types";

export function locateSegmentOrGroup(
  root: Root,
  parts: PathParts
): [Segment | Group, Nodes[]] | null {
  const ancestors: Nodes[] = [root];
  const scope = followGroups(root, parts.groups ?? [], ancestors);
  if (!scope) {
    return null;
  }

  const targetName = parts.segment.name;
  const targetRepetition = parts.segment.repetition;

  // Try to find a segment first
  const matchedSegments = collectSegments(scope, targetName, ancestors);
  if (matchedSegments.length > 0) {
    const index = (targetRepetition ?? 1) - 1;
    const match = matchedSegments[index];
    if (match) {
      return [match.segment, match.ancestors];
    }
  }

  // If no segment found, try to find a group
  const matchedGroups = collectGroups(scope, targetName, ancestors);
  if (matchedGroups.length > 0) {
    const index = (targetRepetition ?? 1) - 1;
    const match = matchedGroups[index];
    if (match) {
      return [match.group, match.ancestors];
    }
  }

  return null;
}

export function locateSegment(
  root: Root,
  parts: PathParts
): [Segment, Nodes[]] | null {
  const ancestors: Nodes[] = [root];
  const scope = followGroups(root, parts.groups ?? [], ancestors);
  if (!scope) {
    return null;
  }

  const matchedSegments = collectSegments(scope, parts.segment.name, ancestors);
  if (matchedSegments.length === 0) {
    return null;
  }

  const index = (parts.segment.repetition ?? 1) - 1;
  const match = matchedSegments[index];
  if (!match) {
    return null;
  }

  return [match.segment, match.ancestors];
}

export function followGroups(
  root: Root,
  groups: GroupLocator[],
  ancestorChain: Nodes[]
): Array<Segment | Group> | null {
  let children = filterSegmentsAndGroups(root.children);

  for (const locator of groups) {
    const matchedGroups = children.filter(
      (node): node is Group =>
        node.type === "group" && node.name === locator.name
    );

    if (matchedGroups.length === 0) {
      return null;
    }

    const index = (locator.repetition ?? 1) - 1;
    const selected = matchedGroups[index];
    if (!selected) {
      return null;
    }

    ancestorChain.push(selected);
    children = filterSegmentsAndGroups(selected.children);
  }

  return children;
}

/**
 * Collect all possible scopes when groups can match multiple instances.
 * Used by selectAll to find nodes across all matching groups.
 */
export function collectAllScopes(
  root: Root,
  groups: GroupLocator[]
): { scope: (Segment | Group)[]; ancestors: Nodes[] }[] {
  if (groups.length === 0) {
    return [
      { ancestors: [root], scope: filterSegmentsAndGroups(root.children) },
    ];
  }

  const results: { scope: (Segment | Group)[]; ancestors: Nodes[] }[] = [];
  const firstLocator = groups[0];
  const remainingGroups = groups.slice(1);

  if (!firstLocator) {
    return [
      { ancestors: [root], scope: filterSegmentsAndGroups(root.children) },
    ];
  }

  const children = filterSegmentsAndGroups(root.children);
  const matchingGroups = children.filter(
    (node): node is Group =>
      node.type === "group" && node.name === firstLocator.name
  );

  // If a specific repetition is requested, only follow that one
  if (firstLocator.repetition !== undefined) {
    const index = firstLocator.repetition - 1;
    const selected = matchingGroups[index];
    if (!selected) {
      return [];
    }
    const ancestors = [root, selected];
    return collectAllScopesRecursive(
      selected.children,
      remainingGroups,
      ancestors
    );
  }

  // Otherwise, follow ALL matching groups
  for (const group of matchingGroups) {
    const ancestors = [root, group];
    const subScopes = collectAllScopesRecursive(
      group.children,
      remainingGroups,
      ancestors
    );
    results.push(...subScopes);
  }

  return results;
}

export function collectAllScopesRecursive(
  children: Nodes[],
  groups: GroupLocator[],
  ancestors: Nodes[]
): { scope: (Segment | Group)[]; ancestors: Nodes[] }[] {
  if (groups.length === 0) {
    return [{ ancestors, scope: filterSegmentsAndGroups(children) }];
  }

  const results: { scope: (Segment | Group)[]; ancestors: Nodes[] }[] = [];
  const firstLocator = groups[0];
  const remainingGroups = groups.slice(1);

  if (!firstLocator) {
    return [{ ancestors, scope: filterSegmentsAndGroups(children) }];
  }

  const filteredChildren = filterSegmentsAndGroups(children);
  const matchingGroups = filteredChildren.filter(
    (node): node is Group =>
      node.type === "group" && node.name === firstLocator.name
  );

  // If a specific repetition is requested, only follow that one
  if (firstLocator.repetition !== undefined) {
    const index = firstLocator.repetition - 1;
    const selected = matchingGroups[index];
    if (!selected) {
      return [];
    }
    const newAncestors = [...ancestors, selected];
    return collectAllScopesRecursive(
      selected.children,
      remainingGroups,
      newAncestors
    );
  }

  // Otherwise, follow ALL matching groups
  for (const group of matchingGroups) {
    const newAncestors = [...ancestors, group];
    const subScopes = collectAllScopesRecursive(
      group.children,
      remainingGroups,
      newAncestors
    );
    results.push(...subScopes);
  }

  return results;
}

export function collectSegments(
  nodes: (Segment | Group)[],
  targetSegmentName: string,
  ancestors: Nodes[]
): { segment: Segment; ancestors: Nodes[] }[] {
  const result: { segment: Segment; ancestors: Nodes[] }[] = [];

  for (const node of nodes) {
    if (node.type === "segment") {
      const name = getSegmentName(node);
      if (name === targetSegmentName) {
        result.push({ ancestors: [...ancestors], segment: node });
      }
    }

    if (node.type === "group") {
      const nextAncestors = [...ancestors, node];
      result.push(
        ...collectSegments(
          filterSegmentsAndGroups(node.children),
          targetSegmentName,
          nextAncestors
        )
      );
    }
  }

  return result;
}

export function collectGroups(
  nodes: (Segment | Group)[],
  targetGroupName: string,
  ancestors: Nodes[]
): { group: Group; ancestors: Nodes[] }[] {
  const result: { group: Group; ancestors: Nodes[] }[] = [];

  for (const node of nodes) {
    if (node.type === "group" && node.name === targetGroupName) {
      result.push({ ancestors: [...ancestors], group: node });
    }

    if (node.type === "group") {
      const nextAncestors = [...ancestors, node];
      result.push(
        ...collectGroups(
          filterSegmentsAndGroups(node.children),
          targetGroupName,
          nextAncestors
        )
      );
    }
  }

  return result;
}

export function locateField(
  segment: Segment,
  fieldNum: number,
  parentAncestors: Nodes[]
): [Field, Nodes[]] | null {
  const fields = getFields(segment);
  const field = fields[fieldNum - 1];
  if (!field) {
    return null;
  }

  return [field, [...parentAncestors, segment]];
}

export function locateRepetition(
  field: Field,
  repetition: number,
  parentAncestors: Nodes[]
): [FieldRepetition, Nodes[]] | null {
  if (repetition < 1) {
    return null;
  }

  const node = field.children?.[repetition - 1];
  if (!node) {
    return null;
  }

  return [node as FieldRepetition, [...parentAncestors, field]];
}

export function locateComponent(
  repetition: FieldRepetition,
  componentNum: number,
  parentAncestors: Nodes[]
): [Component, Nodes[]] | null {
  if (componentNum < 1) {
    return null;
  }

  const component = repetition.children?.[componentNum - 1];
  if (!component) {
    return null;
  }

  return [component as Component, [...parentAncestors, repetition]];
}

export function locateSubcomponent(
  component: Component,
  subcomponentNum: number,
  parentAncestors: Nodes[]
): [Subcomponent, Nodes[]] | null {
  if (subcomponentNum < 1) {
    return null;
  }

  const node = component.children?.[subcomponentNum - 1];
  if (!node) {
    return null;
  }

  return [node as Subcomponent, [...parentAncestors, component]];
}

export function getSegmentName(segment: Segment): string {
  return segment.name;
}

export function getFields(segment: Segment): Field[] {
  return segment.children;
}

export function filterSegmentsAndGroups(nodes: Nodes[]): (Segment | Group)[] {
  return nodes.filter(
    (node): node is Segment | Group =>
      node.type === "segment" || node.type === "group"
  );
}
