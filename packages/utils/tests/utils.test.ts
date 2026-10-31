import type {
  Component,
  Field,
  FieldRepetition,
  Segment,
  Subcomponent,
} from "@glion/ast";

import { getByteLength, getLength, isEmptyNode } from "../src/utils";

// ---------------------------------------------------------------------------
// Test helpers — manual AST construction (no builder dependency)
// ---------------------------------------------------------------------------

/** Create a Subcomponent node */
function sub(val: string): Subcomponent {
  return { type: "subcomponent", value: val };
}

/** Create a Component with subcomponents. If strings given, wraps in subs. */
function comp(...subs: (Subcomponent | string)[]): Component {
  return {
    children: subs.map((s) => (typeof s === "string" ? sub(s) : s)),
    type: "component",
  };
}

/**
 * Create a FieldRepetition with components. If strings given, wraps as
 * single-component.
 */
function rep(...comps: (Component | string)[]): FieldRepetition {
  return {
    children: comps.map((c) => (typeof c === "string" ? comp(c) : c)),
    type: "field-repetition",
  };
}

/**
 * Create a Field. If string given, wraps as single repetition with single
 * component.
 */
function field(...reps: (FieldRepetition | Component | string)[]): Field {
  if (reps.length === 0) {
    return { children: [], type: "field" };
  }

  const children: FieldRepetition[] = reps.map((r) => {
    if (typeof r === "string") {
      return rep(r);
    }
    if (r.type === "component") {
      return { children: [r], type: "field-repetition" } as FieldRepetition;
    }
    return r;
  });

  // If all args are Components (not FieldRepetitions), wrap them in a single repetition
  if (reps.every((r) => typeof r !== "string" && r.type === "component")) {
    return {
      children: [{ children: reps as Component[], type: "field-repetition" }],
      type: "field",
    };
  }

  return { children, type: "field" };
}

/** Create a Segment */
function seg(name: string, ...fields: Field[]): Segment {
  return { children: fields, name, terminator: "\r", type: "segment" };
}

// ---------------------------------------------------------------------------
// isEmptyNode
// ---------------------------------------------------------------------------

describe(isEmptyNode, () => {
  describe("null / undefined / missing", () => {
    it("null → true", () => {
      expect(isEmptyNode(null)).toBe(true);
    });

    it("undefined → true", () => {
      expect(isEmptyNode()).toBe(true);
    });
  });

  describe("subcomponent (leaf node)", () => {
    it('empty string "" → true', () => {
      expect(isEmptyNode(sub(""))).toBe(true);
    });

    it("whitespace only → false (whitespace is valid HL7v2 data)", () => {
      expect(isEmptyNode(sub("   "))).toBe(false);
    });

    it("tab/newline → false (whitespace is valid HL7v2 data)", () => {
      expect(isEmptyNode(sub("\t\n"))).toBe(false);
    });

    it("value → false", () => {
      expect(isEmptyNode(sub("A"))).toBe(false);
    });

    it("single space with text → false", () => {
      expect(isEmptyNode(sub(" A "))).toBe(false);
    });

    it('explicit null "" (delete indicator) → false', () => {
      expect(isEmptyNode(sub('""'))).toBe(false);
    });
  });

  describe("component", () => {
    it("no children → true", () => {
      expect(isEmptyNode({ children: [], type: "component" })).toBe(true);
    });

    it("single empty subcomponent → true", () => {
      expect(isEmptyNode(comp(""))).toBe(true);
    });

    it("multiple empty subcomponents → true", () => {
      expect(isEmptyNode(comp("", ""))).toBe(true);
    });

    it("one populated subcomponent → false", () => {
      expect(isEmptyNode(comp("X"))).toBe(false);
    });

    it("mixed empty and populated subcomponents → false", () => {
      expect(isEmptyNode(comp("", "X"))).toBe(false);
    });
  });

  describe("HL7v2 field scenarios", () => {
    it("|value| → false", () => {
      expect(isEmptyNode(field("hello"))).toBe(false);
    });

    it("|^DOE| → false (value in second component)", () => {
      expect(isEmptyNode(field(comp(""), comp("DOE")))).toBe(false);
    });

    it("|^^system| → false (value in third component)", () => {
      expect(isEmptyNode(field(comp(""), comp(""), comp("system")))).toBe(
        false
      );
    });

    it("|~value| → false (value in second repetition)", () => {
      expect(isEmptyNode(field(rep(""), rep("value")))).toBe(false);
    });

    it("|value~| → false (value in first repetition)", () => {
      expect(isEmptyNode(field(rep("value"), rep("")))).toBe(false);
    });

    it("|val1~val2| → false (both repetitions have values)", () => {
      expect(isEmptyNode(field(rep("val1"), rep("val2")))).toBe(false);
    });

    it("|~^DOE| → false (component in second repetition)", () => {
      expect(isEmptyNode(field(rep(""), rep(comp(""), comp("DOE"))))).toBe(
        false
      );
    });

    it("|M| → false (single character)", () => {
      expect(isEmptyNode(field("M"))).toBe(false);
    });

    it("|code^^system| → false (mixed empty/present components)", () => {
      expect(isEmptyNode(field(comp("code"), comp(""), comp("system")))).toBe(
        false
      );
    });

    it("|| → true (empty string)", () => {
      expect(isEmptyNode(field(""))).toBe(true);
    });

    it("field() → true (no children)", () => {
      expect(isEmptyNode(field())).toBe(true);
    });

    it("|^^| → true (all empty components)", () => {
      expect(isEmptyNode(field(comp(""), comp(""), comp("")))).toBe(true);
    });

    it("|~| → true (empty repetitions)", () => {
      expect(isEmptyNode(field(rep(""), rep("")))).toBe(true);
    });

    it("|~^^| → true (empty rep with empty components)", () => {
      expect(
        isEmptyNode(field(rep(""), rep(comp(""), comp(""), comp(""))))
      ).toBe(true);
    });

    it("|^| → true (two empty components)", () => {
      expect(isEmptyNode(field(comp(""), comp("")))).toBe(true);
    });
  });

  describe("segment and root level", () => {
    it("empty segment → true", () => {
      expect(isEmptyNode(seg("PID"))).toBe(true);
    });

    it("segment with empty fields → true", () => {
      expect(isEmptyNode(seg("PID", field(""), field("")))).toBe(true);
    });

    it("segment with populated field → false", () => {
      expect(isEmptyNode(seg("PID", field("1")))).toBe(false);
    });

    it("segment with mix of empty and populated → false", () => {
      expect(isEmptyNode(seg("PID", field(""), field("value")))).toBe(false);
    });

    it("empty root → true", () => {
      expect(isEmptyNode({ children: [], type: "root" })).toBe(true);
    });
  });

  describe("unknown node types", () => {
    it("node with no value or children → false (defensive)", () => {
      expect(isEmptyNode({ type: "weird-unknown" } as never)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getByteLength
// ---------------------------------------------------------------------------

describe(getByteLength, () => {
  describe("null and undefined handling", () => {
    it("should return 0 for null or undefined nodes", () => {
      expect(getByteLength(null)).toBe(0);
      expect(getByteLength()).toBe(0);
    });
  });

  describe("literal nodes", () => {
    it("should calculate byte length for Subcomponent", () => {
      expect(getByteLength(sub("HELLO"))).toBe(5);
    });

    it("should calculate byte length for empty Subcomponent", () => {
      expect(getByteLength(sub(""))).toBe(0);
    });

    it("should handle multi-byte characters correctly", () => {
      expect(getByteLength(sub("café"))).toBe(5);
    });
  });

  describe("component nodes", () => {
    it("should calculate byte length for single subcomponent", () => {
      expect(getByteLength(comp("ABC"))).toBe(3);
    });

    it("should sum multiple subcomponent lengths", () => {
      expect(getByteLength(comp("ABC", "DEF"))).toBe(6);
    });
  });

  describe("segment nodes", () => {
    it("should include segment name length", () => {
      expect(getByteLength(seg("MSH", field("TEST")))).toBe(7);
    });
  });

  describe("edge cases", () => {
    it("should handle empty children array", () => {
      expect(getByteLength(field())).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// getLength
// ---------------------------------------------------------------------------

describe(getLength, () => {
  describe("null and undefined handling", () => {
    it("should return 0 for null or undefined nodes", () => {
      expect(getLength(null)).toBe(0);
      expect(getLength()).toBe(0);
    });
  });

  describe("literal nodes", () => {
    it("should calculate character length for Subcomponent", () => {
      expect(getLength(sub("HELLO"))).toBe(5);
    });

    it("should handle multi-byte characters as single characters", () => {
      expect(getLength(sub("café"))).toBe(4);
    });
  });

  describe("component nodes", () => {
    it("should sum subcomponent lengths", () => {
      expect(getLength(comp("ABC", "DEF"))).toBe(6);
    });
  });

  describe("segment nodes", () => {
    it("should include segment name length", () => {
      expect(getLength(seg("MSH", field("TEST")))).toBe(7);
    });
  });

  describe("comparison with getByteLength", () => {
    it("should differ for multi-byte characters", () => {
      const node = sub("café");
      expect(getLength(node)).toBe(4);
      expect(getByteLength(node)).toBe(5);
    });
  });

  describe("edge cases", () => {
    it("should handle empty children array", () => {
      expect(getLength(field())).toBe(0);
    });
  });
});
