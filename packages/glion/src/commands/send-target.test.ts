import { describe, expect, it } from "vitest";

import type { SendArgs } from "./send";
import { deriveLocalTarget, resolveTarget } from "./send-target";

function args(overrides: Partial<SendArgs> = {}): SendArgs {
  return { help: false, json: false, local: false, ...overrides };
}

describe("deriveLocalTarget", () => {
  it("uses the config host and port when no flags override", () => {
    const result = deriveLocalTarget({ hostname: "10.0.0.5", port: 2575 }, {});
    expect(result).toEqual({ host: "10.0.0.5", ok: true, port: 2575 });
  });

  it("lets --host and --port override the config", () => {
    const result = deriveLocalTarget(
      { hostname: "10.0.0.5", port: 2575 },
      { host: "example.test", port: 9000 }
    );
    expect(result).toEqual({ host: "example.test", ok: true, port: 9000 });
  });

  it("maps a 0.0.0.0 bind address to IPv4 loopback", () => {
    const result = deriveLocalTarget({ hostname: "0.0.0.0", port: 2575 }, {});
    expect(result).toEqual({ host: "127.0.0.1", ok: true, port: 2575 });
  });

  it("maps an empty bind address to IPv4 loopback", () => {
    const result = deriveLocalTarget({ hostname: "", port: 2575 }, {});
    expect(result).toEqual({ host: "127.0.0.1", ok: true, port: 2575 });
  });

  it("maps a :: bind address to IPv6 loopback", () => {
    const result = deriveLocalTarget({ hostname: "::", port: 2575 }, {});
    expect(result).toEqual({ host: "::1", ok: true, port: 2575 });
  });

  it("rejects a TLS-enabled config (no TLS client yet)", () => {
    const result = deriveLocalTarget(
      { hostname: "127.0.0.1", port: 2575, tls: { cert: "x", key: "y" } },
      {}
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("TLS");
    }
  });

  it("rejects port 0 (ephemeral) when nothing overrides it", () => {
    const result = deriveLocalTarget({ hostname: "127.0.0.1", port: 0 }, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("port 0");
    }
  });

  it("accepts an explicit --port over a config port of 0", () => {
    const result = deriveLocalTarget(
      { hostname: "127.0.0.1", port: 0 },
      { port: 2575 }
    );
    expect(result).toEqual({ host: "127.0.0.1", ok: true, port: 2575 });
  });
});

describe("resolveTarget (explicit, non-local)", () => {
  it("returns the explicit host and port", async () => {
    const result = await resolveTarget(
      args({ host: "h.test", port: 1234 }),
      "/tmp"
    );
    expect(result).toEqual({ host: "h.test", ok: true, port: 1234 });
  });

  it("errors when --host is missing", async () => {
    const result = await resolveTarget(args({ port: 1234 }), "/tmp");
    expect(result.ok).toBe(false);
  });

  it("errors when --port is missing", async () => {
    const result = await resolveTarget(args({ host: "h.test" }), "/tmp");
    expect(result.ok).toBe(false);
  });
});
