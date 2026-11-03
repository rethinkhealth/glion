import type { Nodes } from "@glion/ast";

import { checkLength } from "../src/constraints";

// Mock Nodes
const emptyNode = {
  children: [],
  type: "field",
} as unknown as Nodes;

const shortNode = {
  type: "subcomponent",
  value: "ab", // len 2
} as unknown as Nodes;

const longNode = {
  type: "subcomponent",
  value: "abcdef", // len 6
} as unknown as Nodes;

describe(checkLength, () => {
  it("validates min length", () => {
    // Min 3, has 2 -> Invalid
    expect(checkLength(shortNode, 10, 3)).toStrictEqual({
      error: {
        actual: 2,
        code: "LENGTH_UNDERFLOW",
        expected: 3,
        message: "has length 2 but requires at least 3",
      },
      ok: false,
    });

    // Min 2, has 2 -> Valid
    expect(checkLength(shortNode, 10, 2)).toStrictEqual({ ok: true });
  });

  it("validates max length", () => {
    // Max 5, has 6 -> Invalid
    expect(checkLength(longNode, 5, 0)).toStrictEqual({
      error: {
        actual: 6,
        code: "LENGTH_OVERFLOW",
        expected: 5,
        message: "has length 6 but allows at most 5",
      },
      ok: false,
    });

    // Max 6, has 6 -> Valid
    expect(checkLength(longNode, 6, 0)).toStrictEqual({ ok: true });
  });

  it("handles undefined/empty node as length 0 (valid if min=0, else caught by Usage?)", () => {
    // The function returns valid for empty nodes as it assumes Usage check handles "Required" logic.
    expect(checkLength(undefined, 10, 5)).toStrictEqual({
      error: {
        actual: 0,
        code: "LENGTH_UNDERFLOW",
        expected: 5,
        message: "has length 0 but requires at least 5",
      },
      ok: false,
    });
    expect(checkLength(emptyNode, 10, 5)).toStrictEqual({
      error: {
        actual: 0,
        code: "LENGTH_UNDERFLOW",
        expected: 5,
        message: "has length 0 but requires at least 5",
      },
      ok: false,
    });
    expect(checkLength(undefined, 10, 0)).toStrictEqual({ ok: true });
    expect(checkLength(emptyNode, 10, 0)).toStrictEqual({ ok: true });
  });

  describe("error handling for invalid min/max values", () => {
    it("throws error when min is negative", () => {
      expect(() => checkLength(shortNode, 10, -1)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("throws error when max is negative", () => {
      expect(() => checkLength(shortNode, -1, 0)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("accepts a maximum length of zero", () => {
      expect(checkLength(undefined, 0, 0)).toStrictEqual({ ok: true });
    });

    it("throws error when both min and max are negative", () => {
      expect(() => checkLength(shortNode, -5, -2)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("throws error when min is greater than max", () => {
      expect(() => checkLength(shortNode, 5, 10)).toThrow(
        "Min length cannot be greater than max length"
      );
    });

    it("throws error when min equals max + 1", () => {
      expect(() => checkLength(shortNode, 10, 11)).toThrow(
        "Min length cannot be greater than max length"
      );
    });

    it("does not throw when min equals max", () => {
      expect(() => checkLength(shortNode, 5, 5)).not.toThrow();
    });

    it("does not throw when min is less than max", () => {
      expect(() => checkLength(shortNode, 10, 5)).not.toThrow();
    });
  });
});
