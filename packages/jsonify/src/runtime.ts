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

import type {
  FieldJson,
  GroupJson,
  Hl7v2JsonResult,
  SegmentJson,
} from "./types";

export function toJsonRuntime(root: Nodes): Hl7v2JsonResult {
  const r = root as Root;
  const out: Hl7v2JsonResult = [];

  for (const child of r.children) {
    if (child.type === "segment") {
      out.push(processSegment(child as Segment));
    } else if (child.type === "group") {
      out.push(processGroup(child as Group));
    }
  }

  return out;
}

function processSegment(segment: Segment): SegmentJson {
  const fields: (FieldJson | FieldJson[])[] = [];

  for (const f of segment.children) {
    fields.push(materializeField(f));
  }

  return { fields, segment: segment.name };
}

function processGroup(group: Group): GroupJson {
  const children: (SegmentJson | GroupJson)[] = [];

  for (const child of group.children) {
    if (child.type === "segment") {
      children.push(processSegment(child as Segment));
    } else if (child.type === "group") {
      children.push(processGroup(child as Group));
    }
  }

  return { children, group: group.id, name: group.name };
}

// Convert a Field into JSON-friendly value: string or nested arrays representing reps/components/subcomponents
function materializeField(field: Field): FieldJson | FieldJson[] {
  const toComponent = (c: Component): FieldJson => {
    if (c.children?.length === 0) {
      return "";
    }
    if (c.children?.length === 1) {
      return (c.children[0] as Subcomponent).value;
    }
    return c.children ? c.children.map((sc) => (sc as Subcomponent).value) : [];
  };

  const toRepetition = (r: FieldRepetition): FieldJson | FieldJson[] => {
    if (r.children.length === 0) {
      return "";
    }
    if (r.children.length === 1) {
      return toComponent(r.children[0] as Component);
    }
    return r.children.map((c) => toComponent(c as Component));
  };

  const repetitions = field.children as FieldRepetition[];

  if (repetitions.length === 0) {
    return "";
  }

  if (repetitions.length === 1) {
    const rep = repetitions[0];

    if (!rep) {
      throw new Error("Expected a field repetition");
    }

    const repVal = toRepetition(rep);
    if (rep.children.length === 1) {
      // Single-component rep: preserve nested-array shape when component is composite.
      return Array.isArray(repVal)
        ? ([repVal] as FieldJson[])
        : (repVal as FieldJson);
    }
    return repVal as FieldJson | FieldJson[];
  }

  // Multiple repetitions: project each repetition to a value (string or array)
  return repetitions.map((r) => toRepetition(r as FieldRepetition)) as string[];
}
