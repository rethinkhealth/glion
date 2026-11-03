import type { Field } from "@glion/ast";

import { checkCardinality } from "../src/constraints";

// Mock Nodes
const fieldWith3Reps = {
  children: [
    { children: [], type: "field-repetition" },
    { children: [], type: "field-repetition" },
    { children: [], type: "field-repetition" },
  ],
  type: "field",
} as unknown as Field;

const fieldWith0Reps = {
  children: [],
  type: "field",
} as unknown as Field;

describe(checkCardinality, () => {
  it("validates min repetitions", () => {
    // Min 1, has 0 -> Invalid
    expect(checkCardinality(fieldWith0Reps, 1, 5)).toStrictEqual({
      error: {
        actual: 0,
        code: "CARDINALITY_UNDERFLOW",
        expected: 1,
        message: "has 0 repetitions but requires at least 1",
      },
      ok: false,
    });

    // Min 0, has 0 -> Valid
    expect(checkCardinality(fieldWith0Reps, 0, 5)).toStrictEqual({ ok: true });
  });

  it("validates max repetitions", () => {
    // Max 2, has 3 -> Invalid
    expect(checkCardinality(fieldWith3Reps, 0, 2)).toStrictEqual({
      error: {
        actual: 3,
        code: "CARDINALITY_OVERFLOW",
        expected: 2,
        message: "has 3 repetitions but allows at most 2",
      },
      ok: false,
    });

    // Max 3, has 3 -> Valid
    expect(checkCardinality(fieldWith3Reps, 0, 3)).toStrictEqual({ ok: true });

    // Max *, has 3 -> Valid
    expect(checkCardinality(fieldWith3Reps, 0, "*")).toStrictEqual({
      ok: true,
    });
  });

  it("handles undefined node as 0 repetitions", () => {
    expect(checkCardinality(undefined, 1, "*")).toStrictEqual({
      error: {
        actual: 0,
        code: "CARDINALITY_UNDERFLOW",
        expected: 1,
        message: "has 0 repetitions but requires at least 1",
      },
      ok: false,
    });
    expect(checkCardinality(undefined, 0, "*")).toStrictEqual({ ok: true });
  });

  describe("error handling for invalid min/max values", () => {
    it("throws error when min is negative", () => {
      expect(() => checkCardinality(fieldWith3Reps, -1, 5)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("throws error when max is negative (numeric)", () => {
      expect(() => checkCardinality(fieldWith3Reps, 0, -1)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("accepts a maximum of zero repetitions", () => {
      expect(checkCardinality(undefined, 0, 0)).toStrictEqual({ ok: true });
    });

    it("throws error when both min and max are negative", () => {
      expect(() => checkCardinality(fieldWith3Reps, -2, -5)).toThrow(
        "Min and max lengths must be non-negative"
      );
    });

    it("throws error when min is greater than max (numeric)", () => {
      expect(() => checkCardinality(fieldWith3Reps, 10, 5)).toThrow(
        "Min length cannot be greater than max length"
      );
    });

    it("throws error when min equals max + 1", () => {
      expect(() => checkCardinality(fieldWith3Reps, 6, 5)).toThrow(
        "Min length cannot be greater than max length"
      );
    });

    it("does not throw when min equals max", () => {
      expect(() => checkCardinality(fieldWith3Reps, 5, 5)).not.toThrow();
    });

    it("does not throw when min is less than max", () => {
      expect(() => checkCardinality(fieldWith3Reps, 0, 5)).not.toThrow();
    });

    it("does not throw when max is '*' (unbounded)", () => {
      expect(() => checkCardinality(fieldWith3Reps, 0, "*")).not.toThrow();
      expect(() => checkCardinality(fieldWith3Reps, 5, "*")).not.toThrow();
    });

    it("throws error when min is negative even with max '*'", () => {
      expect(() => checkCardinality(fieldWith3Reps, -1, "*")).toThrow(
        "Min and max lengths must be non-negative"
      );
    });
  });
});
