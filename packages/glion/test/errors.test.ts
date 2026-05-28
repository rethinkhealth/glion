import { describe, expect, it } from "vitest";

import { GlionError } from "../src/errors.js";

describe("GlionError", () => {
  it("carries kind, message, context, and hint", () => {
    const err = new GlionError(
      "config-not-found",
      "No glion config found",
      { cwd: "/app" },
      "Create glion.config.ts"
    );
    expect(err.kind).toBe("config-not-found");
    expect(err.message).toBe("No glion config found");
    expect(err.context).toEqual({ cwd: "/app" });
    expect(err.hint).toBe("Create glion.config.ts");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause for error chaining", () => {
    const underlying = new Error("ENOENT");
    const err = new GlionError(
      "entry-load-failed",
      "entry missing",
      {},
      undefined,
      underlying
    );
    expect(err.cause).toBe(underlying);
  });

  it("context defaults to empty object and hint defaults to undefined", () => {
    const err = new GlionError("port-in-use", "port 2575 in use");
    expect(err.context).toEqual({});
    expect(err.hint).toBeUndefined();
  });
});
