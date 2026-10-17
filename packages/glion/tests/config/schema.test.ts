import { MllpClient, MllpInvalidOptionError } from "@glion/mllp-client";
import type { MllpSocket } from "@glion/mllp-client";
import { describe, expect, it } from "vitest";

import { makeGlionConfigSchema } from "../../src/config/schema";

// Minimal context; the values themselves don't matter for these
// validation-only tests — they're only used by the schema's transforms
// to produce absolute paths, which we don't assert on here.
const ctx = {
  configPath: "/test/glion.config.ts",
  cwd: "/test",
  mode: "start" as const,
};
const schema = makeGlionConfigSchema(ctx);

/** `setTimeout`'s ceiling: the highest timeout the client accepts. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** A socket the client never dials: the constructor is what we exercise. */
const socket: MllpSocket = {
  close: () => Promise.resolve(),
  connect: () => Promise.reject(new Error("never dialed")),
};

describe("makeGlionConfigSchema", () => {
  describe("client", () => {
    it("accepts the client block and passes it through", () => {
      const delay = (attempt: number) => attempt * 100;
      const result = schema.safeParse({
        client: {
          connectTimeoutMs: 2000,
          maxBufferedBytes: 1024,
          reconnect: { attempts: 2, delay },
          sendTimeoutMs: 5000,
        },
        entry: "./src/app.ts",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.client).toEqual({
          connectTimeoutMs: 2000,
          maxBufferedBytes: 1024,
          reconnect: { attempts: 2, delay },
          sendTimeoutMs: 5000,
        });
      }
    });

    // The client asserts its own option ranges in its constructor and throws
    // `MllpInvalidOptionError`. The schema has to agree with it: a value it
    // lets through would otherwise reach the client as an uncaught throw
    // instead of a config error naming the field.
    it("accepts the extremes @glion/mllp-client accepts", () => {
      const client = {
        connectTimeoutMs: MAX_TIMEOUT_MS,
        maxBufferedBytes: 1,
        reconnect: { attempts: Number.POSITIVE_INFINITY },
        sendTimeoutMs: 1,
      };
      expect(schema.safeParse({ client, entry: "./a.ts" }).success).toBe(true);
      expect(() => new MllpClient({ ...client, socket })).not.toThrow();
    });

    it("rejects the values @glion/mllp-client rejects", () => {
      const rejected = [
        { reconnect: { attempts: 1.5 } },
        { reconnect: { attempts: -1 } },
        { connectTimeoutMs: MAX_TIMEOUT_MS + 1 },
        { sendTimeoutMs: MAX_TIMEOUT_MS + 1 },
        { maxBufferedBytes: 0 },
      ];
      for (const client of rejected) {
        expect(schema.safeParse({ client, entry: "./a.ts" }).success).toBe(
          false
        );
        expect(() => new MllpClient({ ...client, socket })).toThrow(
          MllpInvalidOptionError
        );
      }
    });

    it("accepts reconnect: false and an unbounded attempts", () => {
      expect(
        schema.safeParse({ client: { reconnect: false }, entry: "./a.ts" })
          .success
      ).toBe(true);
      expect(
        schema.safeParse({
          client: { reconnect: { attempts: Number.POSITIVE_INFINITY } },
          entry: "./a.ts",
        }).success
      ).toBe(true);
    });

    it("rejects a zero timeout, a non-function delay, and an unknown key", () => {
      expect(
        schema.safeParse({ client: { sendTimeoutMs: 0 }, entry: "./a.ts" })
          .success
      ).toBe(false);
      expect(
        schema.safeParse({
          client: { reconnect: { delay: 1000 } },
          entry: "./a.ts",
        }).success
      ).toBe(false);
      expect(
        schema.safeParse({ client: { timeoutMs: 1000 }, entry: "./a.ts" })
          .success
      ).toBe(false);
    });
  });

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
