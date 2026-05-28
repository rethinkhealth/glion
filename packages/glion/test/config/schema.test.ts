import { describe, expect, it } from "vitest";

import { makeGlionConfigSchema } from "../../src/config/schema.js";

// Minimal context; the values themselves don't matter for these
// validation-only tests — they're only used by the schema's transforms
// to produce absolute paths, which we don't assert on here.
const ctx = {
  configPath: "/test/glion.config.ts",
  cwd: "/test",
  mode: "start" as const,
};
const schema = makeGlionConfigSchema(ctx);

describe("makeGlionConfigSchema", () => {
  it("accepts a minimal config with only entry", () => {
    const result = schema.safeParse({ entry: "./src/app.ts" });
    expect(result.success).toBe(true);
  });

  it("accepts a fully-specified config", () => {
    const result = schema.safeParse({
      entry: "./src/app.ts",
      gracefulCloseMs: 5000,
      hostname: "0.0.0.0",
      keepAlive: true,
      keepAliveInitialDelay: 60_000,
      port: 2575,
      socketTimeout: 0,
      tls: {
        ca: "./certs/ca.pem",
        cert: "./certs/s.pem",
        key: "./certs/s.key",
        passphrase: "secret",
      },
      watch: ["./src", "./handlers"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing entry", () => {
    const result = schema.safeParse({ port: 2575 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["entry"]);
    }
  });

  it("rejects non-string entry", () => {
    const result = schema.safeParse({ entry: 42 });
    expect(result.success).toBe(false);
  });

  it("allows port 0 (ephemeral) and rejects ports outside 0-65535", () => {
    expect(schema.safeParse({ entry: "./a.ts", port: 0 }).success).toBe(true);
    expect(schema.safeParse({ entry: "./a.ts", port: 70_000 }).success).toBe(
      false
    );
    expect(schema.safeParse({ entry: "./a.ts", port: -1 }).success).toBe(false);
  });

  it("requires tls.cert and tls.key when tls is present", () => {
    const result = schema.safeParse({
      entry: "./a.ts",
      tls: { cert: "./c.pem" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const result = schema.safeParse({
      entry: "./a.ts",
      unknownField: true,
    });
    expect(result.success).toBe(false);
  });
});
