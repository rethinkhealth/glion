// A reading's history: the events a thread of runner.ts or a reading of
// repair.ts records as it goes, and the groups they nest into.

import { invariant } from "../invariant";
import type { SegmentMatch } from "./types";

/** One event in a reading's history, linked to the one before it. */
export type Event = Readonly<{ previous: Event | undefined }> &
  (
    | Readonly<{ kind: "consumed" }>
    | Readonly<{ kind: "passed-over" }>
    | Readonly<{ kind: "unexpected" }>
    | Readonly<{ kind: "missing"; id: string }>
    | Readonly<{ kind: "open"; id: string; name: string }>
    | Readonly<{ kind: "close" }>
  );

interface OpenGroup {
  id: string;
  name: string;
  children: SegmentMatch[];
}

/** The events that end in `last`, first to last. */
export function replay(last: Event | undefined): Event[] {
  const events: Event[] = [];
  for (let event = last; event; event = event.previous) {
    events.push(event);
  }
  return events.toReversed();
}

/**
 * Replays the events that end in `last` into nested groups.
 *
 * A consumed segment goes in the innermost open group. A segment passed over
 * or unexpected goes right after the segment before it, in that segment's
 * group. A missing segment makes no node, and a group that holds no segment
 * is left out.
 */
export function nest(last: Event | undefined): SegmentMatch[] {
  const root: SegmentMatch[] = [];
  const open: OpenGroup[] = [];
  let previousSiblings = root;
  let index = 0;
  for (const event of replay(last)) {
    switch (event.kind) {
      case "consumed": {
        previousSiblings = open.at(-1)?.children ?? root;
        previousSiblings.push(index);
        index += 1;
        break;
      }
      case "passed-over":
      case "unexpected": {
        previousSiblings.push(index);
        index += 1;
        break;
      }
      case "missing": {
        break;
      }
      case "open": {
        open.push({ children: [], id: event.id, name: event.name });
        break;
      }
      case "close": {
        const group = open.pop();
        invariant(group !== undefined, "an event closes a group never opened");
        if (group.children.length > 0) {
          (open.at(-1)?.children ?? root).push(group);
        }
        break;
      }
    }
  }
  return root;
}
