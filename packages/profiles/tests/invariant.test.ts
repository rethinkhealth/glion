import { describe, expect, it } from "vitest";

import { invariant } from "../src/invariant";

describe("invariant", () => {
  it("returns when the condition holds", () => {
    expect(() => invariant(true, "never thrown")).not.toThrow();
  });

  it("throws a bug report naming the package when the condition fails", () => {
    expect(() =>
      invariant(undefined, "an event closes a group never opened")
    ).toThrow(
      "@glion/profiles internal invariant violated: an event closes a group never opened — this is a bug, please report it"
    );
  });
});
