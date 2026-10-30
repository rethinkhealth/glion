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
  let lastContentEnd: Position["end"] | null = null;
  let expectingSegmentName = true; // Start expecting a segment name

  const resetState = () => {
    seg = null;
    field = null;
    rep = null;
    comp = null;
    currentSub = null;
    lastContentEnd = null;
    expectingSegmentName = true;
  };

  const openSegment = (name: string, position: Position): Segment => {
    const opened: Segment = {
      children: [],
      name,
      position: { end: position.end, start: position.start },
      terminator: "",
      type: "segment",
    };
    seg = opened;
    root.children.push(opened);
    field = null;
    rep = null;
    comp = null;
    currentSub = null;
    expectingSegmentName = false;
    return opened;
  };

  /**
   * Ensure there is an active segment. If delimiter tokens arrive before
   * any segment name, lazily open a segment with an empty name.
   */
  const ensureSegment = (start: Position["start"]): Segment =>
    seg ?? openSegment("", { end: start, start });

  const openField = (start: Position["start"]) => {
    const segment = ensureSegment(start);
    field = createField(start);
    segment.children.push(field);
    rep = null;
    comp = null;
    currentSub = null;
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
    // The root covers every token, from the first of any kind to the last,
    // the segment terminators included: `|` holds no TEXT token, and its root
    // is 0–1.
    if (root.position) {
      root.position.end = tok.position.end;
    } else {
      root.position = { end: tok.position.end, start: tok.position.start };
    }
    switch (tok.type) {
      case "SEGMENT_END": {
        // An empty line is an empty segment: `MSH|^~\&\r\rPID|1` holds MSH,
        // a segment with an empty Segment ID and no fields, and PID.
        const segment = ensureSegment(tok.position.start);
        const endPos = lastContentEnd || tok.position.start;
        updatePositionsToEnd(endPos);
        // A tokenizer that gives no characters ends the segment with no
        // terminator.
        segment.terminator = tok.value ?? "";
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

    // A message with no tokens is empty, and its root covers 0–0.
    if (!root.position) {
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
