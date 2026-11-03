import type { Field, Nodes } from "@glion/ast";

import { getLength, isEmptyNode } from "./utils";

export type ValidationErrorCode =
  // Constraints
  | "MISSING"
  | "EMPTY"
  | "UNEXPECTED_CONTENT"
  | "CARDINALITY_UNDERFLOW"
  | "CARDINALITY_OVERFLOW"
  | "LENGTH_UNDERFLOW"
  | "LENGTH_OVERFLOW"
  // Value Sets
  | "VALUE_NOT_IN_TABLE";

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  expected?: string | number | Array<string | number>;
  actual?: string | number | Array<string | number>;
}

export interface ValidationSuccess {
  ok: true;
}

export interface ValidationFailure {
  ok: false;
  error: ValidationError;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * HL7v2 optionality, the OPT column of a segment attribute table or a
 * component table.
 */
export const Optionality = {
  /**
   * `B`: the element may be valued; it is kept only for backward compatibility
   * with earlier versions.
   */
  BackwardCompatible: "B",
  /**
   * `C`: the element is required or not used depending on a condition the
   * standard states in prose.
   */
  Conditional: "C",
  /**
   * `X`: the element is not used with this trigger event and must not be
   * valued.
   */
  NotUsed: "X",
  /** `O`: the element may be valued. */
  Optional: "O",
  /** `R`: the element must be valued. */
  Required: "R",
  /**
   * `RE`: the element must be valued when the sender knows the data, and may be
   * empty.
   */
  RequiredButMayBeEmpty: "RE",
  /** `W`: the element is withdrawn and must not be valued. */
  Withdrawn: "W",
} as const;

export type Optionality = (typeof Optionality)[keyof typeof Optionality];

/**
 * Checks if a field satisfies the cardinality constraint.
 */
export function checkCardinality(
  node: Field | undefined,
  min: number,
  max: number | "*"
): ValidationResult {
  // Stryker disable next-line ConditionalExpression,StringLiteral: `*` has no limit, and leaving it as `*` is the same, since it compares false with every number
  const limit = max === "*" ? Number.POSITIVE_INFINITY : max;

  if (min < 0 || limit < 0) {
    throw new Error("Min and max lengths must be non-negative");
  }

  if (min > limit) {
    throw new Error("Min length cannot be greater than max length");
  }

  const count = node?.children ? node.children.length : 0;

  if (count < min) {
    return {
      error: {
        actual: count,
        code: "CARDINALITY_UNDERFLOW",
        expected: min,
        message: `has ${count} repetitions but requires at least ${min}`,
      },
      ok: false,
    };
  }

  if (count > limit) {
    return {
      error: {
        actual: count,
        code: "CARDINALITY_OVERFLOW",
        expected: limit,
        message: `has ${count} repetitions but allows at most ${max}`,
      },
      ok: false,
    };
  }

  return { ok: true };
}

/**
 * Checks if a node satisfies the length constraint.
 */
export function checkLength(
  node: Nodes | undefined,
  max: number,
  min = 0
): ValidationResult {
  if (min < 0 || max < 0) {
    throw new Error("Min and max lengths must be non-negative");
  }

  if (min > max) {
    throw new Error("Min length cannot be greater than max length");
  }

  const length = getLength(node);

  if (length < min) {
    return {
      error: {
        actual: length,
        code: "LENGTH_UNDERFLOW",
        expected: min,
        message: `has length ${length} but requires at least ${min}`,
      },
      ok: false,
    };
  }

  if (length > max) {
    return {
      error: {
        actual: length,
        code: "LENGTH_OVERFLOW",
        expected: max,
        message: `has length ${length} but allows at most ${max}`,
      },
      ok: false,
    };
  }

  return { ok: true };
}

/**
 * Checks if a node satisfies the optionality constraint.
 */
export function checkOptionality(
  node: Nodes | undefined,
  optionality: Optionality | string
): ValidationResult {
  const code = optionality.toUpperCase();

  switch (code) {
    case Optionality.RequiredButMayBeEmpty:
    case Optionality.Optional:
    case Optionality.Conditional:
    case Optionality.BackwardCompatible:
    case Optionality.Withdrawn: {
      return { ok: true };
    }

    case Optionality.Required: {
      if (!node) {
        return {
          error: {
            code: "MISSING",
            expected: "R",
            message: "is required but missing",
          },
          ok: false,
        };
      }
      if (isEmptyNode(node)) {
        return {
          error: {
            code: "EMPTY",
            expected: "R",
            message: "is required but empty",
          },
          ok: false,
        };
      }
      return { ok: true };
    }

    case Optionality.NotUsed: {
      if (node && !isEmptyNode(node)) {
        return {
          error: {
            code: "UNEXPECTED_CONTENT",
            expected: "X",
            message: "is not supported but present",
          },
          ok: false,
        };
      }
      return { ok: true };
    }

    default: {
      return { ok: true };
    }
  }
}
