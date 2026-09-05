import type { Group, Nodes, Root, Segment } from "@glion/ast";

import { parse } from "./parse";
import type { InferNodeType } from "./types";
import {
  collectAllScopes,
  collectGroups,
  collectSegments,
  locateComponent,
  locateField,
  locateRepetition,
  locateSegment,
  locateSegmentOrGroup,
  locateSubcomponent,
} from "./utils";

/**
 * Select the first node at the given path and return it with its ancestor
 * chain.
 *
 * This function finds the first matching node for the given path. For paths
 * that can match multiple nodes (e.g., "PID" when multiple PID segments exist),
 * use {@link selectAll} to retrieve all matches.
 *
 * @example
 *   ```typescript
 *   const result = select(root, "PID-5");
 *   if (result) {
 *     result.node; // Type: Field
 *     result.ancestors; // [Root, Segment]
 *   }
 *   ```;
 *
 * @param root - The root node to search from
 * @param path - The HL7 path string
 * @returns Object containing the node and its ancestors, or null if not found
 */
export function select<Path extends string>(
  root: Root,
  path: Path
): { node: InferNodeType<Path>; ancestors: Nodes[] } | null {
  const parts = parse(path);

  // If no field access, we might be selecting a segment OR a group
  if (parts.field === undefined) {
    const result = locateSegmentOrGroup(root, parts);
    if (!result) {
      return null;
    }
    return {
      ancestors: result[1],
      node: result[0] as unknown as InferNodeType<Path>,
    };
  }

  // Field access means we're definitely accessing a segment
  const segmentResult = locateSegment(root, parts);
  if (!segmentResult) {
    return null;
  }
  const [segment, segmentAncestors] = segmentResult;

  const fieldResult = locateField(segment, parts.field, segmentAncestors);
  if (!fieldResult) {
    return null;
  }
  const [field, fieldAncestors] = fieldResult;

  if (
    parts.component === undefined &&
    parts.subcomponent === undefined &&
    parts.repetition === undefined
  ) {
    return {
      ancestors: fieldAncestors,
      node: field as unknown as InferNodeType<Path>,
    };
  }

  const repetitionResult = locateRepetition(
    field,
    parts.repetition ?? 1,
    fieldAncestors
  );
  if (!repetitionResult) {
    return null;
  }
  const [repetitionNode, repetitionAncestors] = repetitionResult;

  if (parts.component === undefined) {
    return {
      ancestors: repetitionAncestors,
      node: repetitionNode as unknown as InferNodeType<Path>,
    };
  }

  const componentResult = locateComponent(
    repetitionNode,
    parts.component,
    repetitionAncestors
  );
  if (!componentResult) {
    return null;
  }
  const [componentNode, componentAncestors] = componentResult;

  if (parts.subcomponent === undefined) {
    return {
      ancestors: componentAncestors,
      node: componentNode as unknown as InferNodeType<Path>,
    };
  }

  const subResult = locateSubcomponent(
    componentNode,
    parts.subcomponent,
    componentAncestors
  );
  if (!subResult) {
    return null;
  }

  return {
    ancestors: subResult[1],
    node: subResult[0] as unknown as InferNodeType<Path>,
  };
}

/**
 * Select all nodes that match the given path.
 *
 * This function returns all matching nodes for paths that can match multiple
 * elements. For example, "PID" will return all PID segments in the message, and
 * "OBX-5" will return all observation values.
 *
 * @example
 *   ```typescript
 *   // Get all OBX segments
 *   const results = selectAll(root, "OBX");
 *   for (const { node } of results) {
 *     console.log(node.type); // 'segment'
 *   }
 *
 *   // Get all patient name fields
 *   const names = selectAll(root, "PID-5");
 *   ```;
 *
 * @param root - The root node to search from
 * @param path - The HL7 path string (must not include repetition index)
 * @returns Array of objects containing nodes and their ancestor chains
 */
// oxlint-disable-next-line complexity
export function selectAll<Path extends string>(
  root: Root,
  path: Path
): { node: InferNodeType<Path>; ancestors: Nodes[] }[] {
  const parts = parse(path);

  // If path includes a specific repetition, delegate to select()
  if (
    parts.segment.repetition !== undefined ||
    parts.repetition !== undefined
  ) {
    const result = select(root, path);
    return result ? [result] : [];
  }

  const results: { node: InferNodeType<Path>; ancestors: Nodes[] }[] = [];

  // Get all matching segments from all possible scopes
  const scopes = collectAllScopes(root, parts.groups ?? []);
  const segments: { segment: Segment; ancestors: Nodes[] }[] = [];
  const includeGroups = parts.field === undefined;
  const groups: { group: Group; ancestors: Nodes[] }[] = [];

  for (const { scope, ancestors } of scopes) {
    const matchingSegments = collectSegments(
      scope,
      parts.segment.name,
      ancestors
    );
    segments.push(...matchingSegments);

    if (includeGroups) {
      const matchingGroups = collectGroups(
        scope,
        parts.segment.name,
        ancestors
      );
      for (const { group, ancestors: groupAncestors } of matchingGroups) {
        groups.push({ ancestors: groupAncestors, group });
      }
    }
  }

  // If path is segment-only, return all matching segments and groups
  if (parts.field === undefined) {
    for (const { segment, ancestors } of segments) {
      results.push({
        ancestors,
        node: segment as InferNodeType<Path>,
      });
    }

    for (const { group, ancestors } of groups) {
      results.push({
        ancestors,
        node: group as InferNodeType<Path>,
      });
    }
    return results;
  }

  // For each segment, try to get the field/component/subcomponent
  for (const { segment, ancestors: segmentAncestors } of segments) {
    const fieldResult = locateField(segment, parts.field, segmentAncestors);
    if (!fieldResult) {
      continue;
    }
    const [field, fieldAncestors] = fieldResult;

    if (
      parts.component === undefined &&
      parts.subcomponent === undefined &&
      parts.repetition === undefined
    ) {
      results.push({
        ancestors: fieldAncestors,
        node: field as unknown as InferNodeType<Path>,
      });
      continue;
    }

    // For field repetitions, components, and subcomponents,
    // we need to iterate through all repetitions
    if (!field.children) {
      continue;
    }

    for (const repetitionNode of field.children) {
      const repetitionAncestors = [...fieldAncestors, field];

      if (parts.component === undefined) {
        results.push({
          ancestors: repetitionAncestors,
          node: repetitionNode as unknown as InferNodeType<Path>,
        });
        continue;
      }

      const componentResult = locateComponent(
        repetitionNode,
        parts.component,
        repetitionAncestors
      );
      if (!componentResult) {
        continue;
      }
      const [componentNode, componentAncestors] = componentResult;

      if (parts.subcomponent === undefined) {
        results.push({
          ancestors: componentAncestors,
          node: componentNode as unknown as InferNodeType<Path>,
        });
        continue;
      }

      const subResult = locateSubcomponent(
        componentNode,
        parts.subcomponent,
        componentAncestors
      );
      if (subResult) {
        results.push({
          ancestors: subResult[1],
          node: subResult[0] as unknown as InferNodeType<Path>,
        });
      }
    }
  }

  return results;
}
