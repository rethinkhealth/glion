import type {
  Component,
  Field,
  FieldRepetition,
  Root,
  Segment,
  Subcomponent,
} from "@glion/ast";
import type { Position } from "unist";

import type { Token } from "./types";

function createSubcomponent(start: Position["start"]): Subcomponent {
  return {
    position: { end: start, start },
    type: "subcomponent",
    value: "",
  };
}

function createComponent(start: Position["start"]): Component {
  return {
    children: [],
    position: { end: start, start },
    type: "component",
  };
}

function createFieldRepetition(start: Position["start"]): FieldRepetition {
  return {
    children: [],
    position: { end: start, start },
    type: "field-repetition",
  };
}

function createField(start: Position["start"]): Field {
  return {
    children: [],
    position: { end: start, start },
    type: "field",
  };
}

// Shared core: process a single token into mutable parse state
function createParserCore() {
  const root: Root = {
    children: [],
    type: "root",
  };

  let seg: Segment | null = null;
  let field: Field | null = null;
  let rep: FieldRepetition | null = null;
  let comp: Component | null = null;
  let currentSub: Subcomponent | null = null;
  let segmentHasContent = false;
  let lastContentEnd: Position["end"] | null = null;
  let documentEnd: Position["end"] | null = null; // Track document-level end position
  let expectingSegmentName = true; // Start expecting a segment name
  let rootStartSet = false; // Track if we've set the root start position

  const resetState = () => {
    seg = null;
    field = null;
    rep = null;
    comp = null;
    currentSub = null;
    segmentHasContent = false;
    lastContentEnd = null;
    expectingSegmentName = true;
  };

  const openSegment = (name: string, position: Position) => {
    seg = {
      children: [],
      name,
      position: { end: position.end, start: position.start },
      type: "segment",
    };
    root.children.push(seg);
    field = null;
    rep = null;
    comp = null;
    currentSub = null;
    segmentHasContent = false;
    expectingSegmentName = false;
  };

  /**
   * Ensure there is an active segment. If delimiter tokens arrive before
   * any segment name, lazily open a segment with an empty name.
   */
  const ensureSegment = (start: Position["start"]) => {
    if (!seg) {
      openSegment("", { end: start, start });
    }
  };

  const openField = (start: Position["start"]) => {
    ensureSegment(start);
    field = createField(start);
    seg!.children.push(field);
    rep = null;
    comp = null;
    currentSub = null;
    segmentHasContent = true;
  };

  // A delimiter at `at` opens a sibling at `after`; an empty node before the
  // delimiter is placed at `at`. In `PID|~`, the field is 4–5, its repetitions
  // 4–4 and 5–5.
  const openRepetition = (at: Position["start"], after: Position["start"]) => {
    // If field has no children yet, add empty first rep
    if (field!.children.length === 0) {
      const emptyRep = createFieldRepetition(at);
      field!.children.push(emptyRep);
    }
    rep = createFieldRepetition(after);
    field!.children.push(rep);
    comp = null;
    currentSub = null;
    segmentHasContent = true;
  };

  // Ensure there's a component to add subcomponents to (for SUBCOMP_DELIM)
  // Does NOT add empty sibling components.
  const ensureComponent = (start: Position["start"]) => {
    if (!field) {
      openField(start);
    }
    if (!rep) {
      rep = createFieldRepetition(start);
      field!.children.push(rep);
    }
    if (!comp) {
      comp = createComponent(start);
      rep.children.push(comp);
    }
    segmentHasContent = true;
  };

  const openComponent = (at: Position["start"], after: Position["start"]) => {
    if (!rep) {
      rep = createFieldRepetition(at);
      field!.children.push(rep);
    }
    if (rep.children.length === 0) {
      const emptyComp = createComponent(at);
      rep.children.push(emptyComp);
    }
    comp = createComponent(after);
    rep.children.push(comp);
    currentSub = null;
    segmentHasContent = true;
  };

  const ensureForText = (start: Position["start"]) => {
    if (!field) {
      openField(start);
    }
    if (!rep) {
      rep = createFieldRepetition(start);
      field!.children.push(rep);
    }
    if (!comp) {
      comp = createComponent(start);
      rep.children.push(comp);
    }
    if (!currentSub) {
      currentSub = createSubcomponent(start);
      comp.children.push(currentSub);
      segmentHasContent = true;
    }
  };

  const updatePositionsToEnd = (endPos: Position["end"]) => {
    if (currentSub?.position) {
      currentSub.position.end = endPos;
    }
    if (comp?.position) {
      comp.position.end = endPos;
    }
    if (rep?.position) {
      rep.position.end = endPos;
    }
    if (field?.position) {
      field.position.end = endPos;
    }
    if (seg?.position) {
      seg.position.end = endPos;
    }
  };

  const processToken = (tok: Token) => {
    // The root starts at the first token of any kind: `|` holds no TEXT token,
    // and its root is 0–1.
    if (!rootStartSet) {
      root.position = { end: tok.position.start, start: tok.position.start };
      rootStartSet = true;
    }
    // The root ends at the last token, the segment terminators included.
    documentEnd = tok.position.end;
    switch (tok.type) {
      case "SEGMENT_END": {
        const endPos = lastContentEnd || tok.position.start;
        updatePositionsToEnd(endPos);
        resetState();
        return;
      }
      case "FIELD_DELIM": {
        lastContentEnd = tok.position.end;
        // A line that starts with a field delimiter has an empty Segment ID
        ensureSegment(tok.position.start);
        openField(tok.position.end);
        return;
      }
      case "REPETITION_DELIM": {
        lastContentEnd = tok.position.end;
        openRepetition(tok.position.start, tok.position.end);
        updatePositionsToEnd(tok.position.end);
        return;
      }
      case "COMPONENT_DELIM": {
        lastContentEnd = tok.position.end;
        openComponent(tok.position.start, tok.position.end);
        updatePositionsToEnd(tok.position.end);
        return;
      }
      case "SUBCOMP_DELIM": {
        lastContentEnd = tok.position.end;
        ensureComponent(tok.position.start);
        // If comp has no children yet, add empty first subcomponent
        if (comp!.children.length === 0) {
          const emptySub = createSubcomponent(tok.position.start);
          comp!.children.push(emptySub);
        }
        currentSub = createSubcomponent(tok.position.end);
        comp?.children.push(currentSub);
        segmentHasContent = true;
        updatePositionsToEnd(tok.position.end);
        return;
      }
      case "TEXT": {
        const val = tok.value ?? "";

        // If we're expecting a segment name, this TEXT is the segment name
        if (expectingSegmentName) {
          openSegment(val, tok.position);
          lastContentEnd = tok.position.end;
          return;
        }

        // Otherwise, it's regular field content
        ensureForText(tok.position.start);
        if (currentSub) {
          currentSub.value += val;
        }
        updatePositionsToEnd(tok.position.end);
        lastContentEnd = tok.position.end;
        segmentHasContent = true;
        return;
      }
      default: {
        throw new Error(`Unexpected token type: ${tok.type}`);
      }
    }
  };

  // Do not pre-open a segment; lazily open upon first non-SEGMENT_END token.

  const finalize = () => {
    if (lastContentEnd && seg) {
      updatePositionsToEnd(lastContentEnd);
    }
    if (seg && !segmentHasContent && !seg.name) {
      // Drop trailing empty segment only when it was lazily opened by
      // `ensureSegment` (no name, no content). A segment that arrived
      // with a name carries information — even if no fields followed —
      // and dropping it would break round-trip idempotency: the
      // serializer re-emits the name, the next parse would drop it
      // again, and any sibling segment immediately preceding it would
      // shift into the trailing position and get dropped on the
      // following parse.
      root.children.pop();
    }

    // Set root end position once at finalization using document-level end
    if (root.position && documentEnd) {
      root.position.end = documentEnd;
    } else if (!root.position) {
      root.position = {
        end: { column: 1, line: 1, offset: 0 },
        start: { column: 1, line: 1, offset: 0 },
      };
    }

    return root;
  };

  return { finalize, processToken, root };
}

export function parseHL7v2FromIterator(tokens: Iterable<Token>): Root {
  const core = createParserCore();
  for (const tok of tokens) {
    core.processToken(tok);
  }
  return core.finalize();
}
