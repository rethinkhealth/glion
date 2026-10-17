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

  it("defaults the port to the MLLP standard when only --host is given", () => {
    const result = resolveTarget(args({ host: "h.test" }));
    expect(result).toEqual({ host: "h.test", ok: true, port: 2575 });
  });

  it("errors when --host is missing, whether or not --port is given", () => {
    for (const given of [args({ port: 1234 }), args()]) {
      const result = resolveTarget(given);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe(
          "No target host is defined. Pass `--host` with the system to send to."
        );
      }
    }
  });
});
