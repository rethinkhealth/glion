import { describe, expect, it } from "vitest";

import type { SendArgs } from "../../src/commands/send";
import { resolveTarget } from "../../src/commands/send-target";

function args(overrides: Partial<SendArgs> = {}): SendArgs {
  return { help: false, json: false, ...overrides };
}

describe("resolveTarget", () => {
  it("returns the host and port the invocation names", () => {
    const result = resolveTarget(args({ host: "h.test", port: 1234 }));
    expect(result).toEqual({ host: "h.test", ok: true, port: 1234 });
  });

  it("errors when --host is missing", () => {
    const result = resolveTarget(args({ port: 1234 }));
    expect(result).toEqual({
      ok: false,
      reason: "Specify a target with --host and --port.",
    });
  });

  it("errors when --port is missing", () => {
    const result = resolveTarget(args({ host: "h.test" }));
    expect(result.ok).toBe(false);
  });

  it("errors when neither is given", () => {
    expect(resolveTarget(args()).ok).toBe(false);
  });
});
