import { describe, expect, it } from "vitest";

import { invariant, InvariantError } from "../src/invariant";

describe("invariant", () => {
  it("passes silently on a truthy condition", () => {
    expect(() => invariant(true, "unused")).not.toThrow();
  });

  it("throws InvariantError with the bug framing on a falsy condition", () => {
    expect(() => invariant(false, "the cursor drifted")).toThrow(
      InvariantError
    );
    expect(() => invariant(false, "the cursor drifted")).toThrow(
      /@glion\/util-uid internal invariant violated: the cursor drifted — this is a bug, please report it/
    );
  });

  it("narrows types for the compiler (asserts signature)", () => {
    const maybe: string | undefined = "value" as string | undefined;
    invariant(maybe !== undefined, "maybe is set");
    // No non-null assertion needed below — `asserts` narrowed the type.
    expect(maybe.length).toBe(5);
  });
});
