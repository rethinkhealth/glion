// Greedy backtracking parser over a MessageStructure: the reference semantics
// that matchStructure is checked against. Written against the structure
// directly so it shares nothing with compileStructure or matchStructure.
//
// Continuations are hash-consed (one closure per logical continuation) and
// their failures memoized per input position, which keeps backtracking
// polynomial. Only failures are memoized, so the first success in priority
// order is still the one returned.
import type {
  MessageStructure,
  StructureElement,
  StructureMatch,
} from "../src/structure/types.ts";

type Next = (at: number) => boolean;
type Op = number | { open: string } | "close";

// oxlint-disable-next-line complexity/complexity -- backtracking grammar parser: the branches are the structure's element kinds and the greedy occurrence order
export function referenceMatch(
  structure: MessageStructure,
  input: readonly string[]
): StructureMatch[] | undefined {
  const ops: Op[] = [];
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  const continuations = new WeakMap<Next, Map<string, Next>>();
  const failures = new WeakMap<Next, Set<number>>();

  const id = (node: object): number => {
    let value = ids.get(node);
    if (value === undefined) {
      value = nextId;
      nextId += 1;
      ids.set(node, value);
    }
    return value;
  };

  const continuation = (outer: Next, key: string, make: () => Next): Next => {
    let byKey = continuations.get(outer);
    if (!byKey) {
      byKey = new Map();
      continuations.set(outer, byKey);
    }
    let next = byKey.get(key);
    if (!next) {
      next = make();
      byKey.set(key, next);
    }
    return next;
  };

  const run = (next: Next, at: number): boolean => {
    const failed = failures.get(next);
    if (failed?.has(at)) {
      return false;
    }
    if (next(at)) {
      return true;
    }
    if (failed) {
      failed.add(at);
    } else {
      failures.set(next, new Set([at]));
    }
    return false;
  };

  const sequence = (
    elements: readonly StructureElement[],
    k: number,
    at: number,
    next: Next
  ): boolean => {
    const element = elements[k];
    if (element === undefined) {
      return run(next, at);
    }
    const rest = continuation(
      next,
      `s${id(elements)}:${k}`,
      () => (j) => sequence(elements, k + 1, j, next)
    );
    return occurrences(element, 0, at, rest);
  };

  // Greedy: one more occurrence first, then stop. An occurrence beyond the
  // required one must consume at least one segment.
  const occurrences = (
    element: StructureElement,
    count: number,
    at: number,
    next: Next
  ): boolean => {
    const min = element.optional ? 0 : 1;
    const max = element.repeating ? Number.POSITIVE_INFINITY : 1;
    if (count < max) {
      const mark = ops.length;
      const more = continuation(
        next,
        `o${id(element)}:${Math.min(count, 2)}:${at}`,
        () => (j) =>
          (j > at || count < min) && occurrences(element, count + 1, j, next)
      );
      if (once(element, at, more)) {
        return true;
      }
      ops.length = mark;
    }
    return count >= min && run(next, at);
  };

  const once = (element: StructureElement, at: number, next: Next): boolean => {
    switch (element.type) {
      case "segment": {
        const name = input[at];
        if (
          name === undefined ||
          (element.name !== "Hxx" && element.name !== name)
        ) {
          return false;
        }
        ops.push(at);
        return run(next, at + 1);
      }
      case "group": {
        ops.push({ open: element.name });
        const close = continuation(next, `c${id(element)}`, () => (j) => {
          ops.push("close");
          return run(next, j);
        });
        return sequence(element.elements, 0, at, close);
      }
      case "choice": {
        for (const alternative of element.alternatives) {
          const mark = ops.length;
          if (occurrences(alternative, 0, at, next)) {
            return true;
          }
          ops.length = mark;
        }
        return false;
      }
    }
  };

  const end: Next = (at) => at === input.length;
  if (!sequence(structure.elements, 0, 0, end)) {
    return undefined;
  }

  const root: StructureMatch[] = [];
  const open: { name: string; children: StructureMatch[] }[] = [];
  for (const op of ops) {
    const siblings = open.at(-1)?.children ?? root;
    if (typeof op === "number") {
      siblings.push(op);
    } else if (op === "close") {
      const group = open.pop();
      if (group && group.children.length > 0) {
        (open.at(-1)?.children ?? root).push(group);
      }
    } else {
      open.push({ children: [], name: op.open });
    }
  }
  return root;
}
