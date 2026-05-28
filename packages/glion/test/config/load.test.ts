import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspect } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config/load.js";
import { GlionError } from "../../src/errors.js";

let dir: string;
let cacheDir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-load-"));
  cacheDir = join(dir, ".glion");
  await mkdir(cacheDir, { recursive: true });
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("loadConfig — discovery and loading", () => {
  it("loads a TypeScript config file and returns ResolvedConfig", async () => {
    const entry = join(dir, "src", "app.ts");
    await mkdir(join(dir, "src"));
    await writeFile(entry, "export default {};");
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", port: 2600 };`
    );

    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.entry).toBe(resolve(dir, "src", "app.ts"));
    expect(resolved.port).toBe(2600);
    expect(resolved.hostname).toBe("0.0.0.0");
    expect(resolved.gracefulCloseMs).toBe(5000);
  });

  it("throws GlionError('config-invalid') when schema validation fails", async () => {
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { port: "not-a-number" };`
    );
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-invalid",
    });
  });

  it("surfaces every validation issue in the error message, not just the first", async () => {
    // Three concurrent problems: missing required `entry`, wrong type
    // for `port`, and an unknown field. Zod returns all three in one
    // pass — the loader must format all three so users don't have to
    // fix-and-retry serially.
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { port: "not-a-number", unknownField: true };`
    );
    try {
      await loadConfig({ cacheDir, cwd: dir });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GlionError);
      const err = error as GlionError;
      // All three fields must be mentioned in the human-readable message.
      expect(err.message).toContain("entry");
      expect(err.message).toContain("port");
      expect(err.message).toContain("unknownField");
      // And the structured context must carry every issue, not just one.
      const ctxIssues = (err.context as { issues: unknown[] }).issues;
      expect(ctxIssues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not attach the raw ZodError as cause (P1-2 guard)", async () => {
    // Defense-in-depth for P1-2. Zod v3's `ZodIssue` is already
    // fairly sanitized (no `input` field), but:
    //   1. Zod v4 reintroduces `input` on every issue — a future
    //      upgrade would silently start leaking user values.
    //   2. Enum-mismatch `message` strings quote the received value,
    //      which could leak if a future schema used a sensitive enum.
    //   3. The sanitized `context.issues` we construct ourselves is
    //      the authoritative diagnostic surface — the raw ZodError
    //      adds nothing we need.
    //
    // Assert: `cause` is not a ZodError (i.e., it doesn't carry the
    // parser's internal `issues` structure).
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { port: "not-a-number" };`
    );
    try {
      await loadConfig({ cacheDir, cwd: dir });
      expect.fail("should have thrown");
    } catch (error) {
      const cause = (error as GlionError).cause;
      if (cause !== undefined) {
        // Any non-undefined cause must NOT be a ZodError. The `issues`
        // array is the giveaway — only ZodError carries that shape.
        expect(cause).not.toHaveProperty("issues");
      }
    }
  });

  it("produces a non-ZodError-shaped error surface for sensitive configs (full view)", async () => {
    // Belt-and-suspenders: even with a passphrase in the config AND a
    // schema violation that involves the `tls` object, a full
    // util.inspect walk (depth 10, hidden props) must not contain the
    // raw passphrase. Catches regressions where `cause` or another
    // field grows a path back to user values.
    const SENTINEL = "SECRET_PHRASE_DO_NOT_LEAK_12345";
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "app.ts"), "export default {};");
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default {
        entry: "./src/app.ts",
        unknownField: "oops",
        tls: { cert: "./c", key: "./k", passphrase: "${SENTINEL}" }
      };`
    );

    let caught: unknown;
    try {
      await loadConfig({ cacheDir, cwd: dir });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GlionError);
    const fullView = inspect(caught, { depth: 10, showHidden: true });
    expect(fullView).not.toContain(SENTINEL);
  });

  it("wraps a TS syntax error in the config as GlionError('config-invalid') with phase=compile", async () => {
    // Invalid TypeScript — rolldown's transform() produces diagnostics
    // rather than returning successfully. Without wrapping, this
    // would bubble up as a raw rolldown error and the supervisor would
    // mis-classify it as a child crash. The wrap pins it as the
    // user's problem (config-invalid) at the right phase (compile).
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { port: <<< not valid typescript`
    );
    try {
      await loadConfig({ cacheDir, cwd: dir });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GlionError);
      const err = error as GlionError;
      expect(err.kind).toBe("config-invalid");
      expect(
        (err.context as { phase?: string }).phase,
        "phase must identify the stage that failed"
      ).toBe("compile");
      expect(err.cause, "original error preserved as cause").toBeDefined();
    }
  });

  it("wraps a top-level throw in the config as GlionError('config-invalid') with phase=import", async () => {
    // The compile step succeeds — it's valid TypeScript. The import
    // step fails because the module's top level throws on load.
    // Both cases are "the user's config is broken" (config-invalid),
    // but the hint differs, so the phase flag matters.
    await writeFile(
      join(dir, "glion.config.ts"),
      `throw new Error("boom at module load");`
    );
    try {
      await loadConfig({ cacheDir, cwd: dir });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GlionError);
      const err = error as GlionError;
      expect(err.kind).toBe("config-invalid");
      expect((err.context as { phase?: string }).phase).toBe("import");
      // Cause chain carries the original "boom at module load" error.
      const cause = err.cause as Error | undefined;
      expect(cause).toBeDefined();
      expect(cause?.message).toContain("boom");
    }
  });

  it("throws GlionError('config-not-found') when no config file exists", async () => {
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-not-found",
    });
  });
});

describe("loadConfig — path resolution", () => {
  it("resolves relative entry and tls paths relative to the config file", async () => {
    const cfgDir = join(dir, "app");
    const certsDir = join(cfgDir, "certs");
    await mkdir(cfgDir);
    await mkdir(certsDir);
    await writeFile(join(cfgDir, "entry.ts"), "export default {};");
    await writeFile(join(certsDir, "s.pem"), "cert");
    await writeFile(join(certsDir, "s.key"), "key");
    await writeFile(
      join(cfgDir, "glion.config.ts"),
      `export default {
        entry: "./entry.ts",
        tls: { cert: "./certs/s.pem", key: "./certs/s.key" },
      };`
    );

    const resolved = await loadConfig({ cacheDir, cwd: cfgDir });
    expect(resolved.entry).toBe(resolve(cfgDir, "entry.ts"));
    expect(resolved.tls?.cert).toBe(resolve(cfgDir, "certs", "s.pem"));
    expect(resolved.tls?.key).toBe(resolve(cfgDir, "certs", "s.key"));
  });

  it("defaults watch to [dirname(entry)]", async () => {
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "app.ts"), "export default {};");
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts" };`
    );

    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.watch).toEqual([resolve(dir, "src")]);
  });

  it("defaults hostname to 127.0.0.1 in dev mode and 0.0.0.0 in start mode", async () => {
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "app.ts"), "export default {};");
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts" };`
    );

    const dev = await loadConfig({ cacheDir, cwd: dir, mode: "dev" });
    expect(dev.hostname).toBe("127.0.0.1");

    const start = await loadConfig({ cacheDir, cwd: dir, mode: "start" });
    expect(start.hostname).toBe("0.0.0.0");
  });

  it("sanitizes zod issue context to exclude raw user input", async () => {
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./a.ts", tls: { cert: "c", key: "k", passphrase: "SECRET_VALUE" }, port: "not-a-number" };`
    );
    try {
      await loadConfig({ cacheDir, cwd: dir });
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(GlionError);
      const serialized = JSON.stringify((error as GlionError).context);
      expect(serialized).not.toContain("SECRET_VALUE");
    }
  });

  it("does not walk above cwd for ancestor configs", async () => {
    const project = join(dir, "project");
    await mkdir(project);
    await writeFile(
      join(dir, "glion.config.ts"),
      `throw new Error("ancestor config was loaded");`
    );

    await expect(loadConfig({ cacheDir, cwd: project })).rejects.toMatchObject({
      kind: "config-not-found",
    });
  });
});

/**
 * The `logging` config field is polymorphic — it accepts a boolean, a
 * LogLevel string, or a full `{ dir?, maxFiles?, level? }` object. The
 * schema collapses all three into the single `ResolvedLogging` shape
 * via a Zod `.transform()`, so downstream consumers (the file logger)
 * see a uniform shape regardless of which form the user wrote.
 */
describe("loadConfig — logging", () => {
  async function writeMinimalConfig(loggingExpr?: string): Promise<void> {
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src", "app.ts"), "export default {};");
    const loggingLine =
      loggingExpr === undefined ? "" : `logging: ${loggingExpr},`;
    await writeFile(
      join(dir, "glion.config.ts"),
      `export default { entry: "./src/app.ts", ${loggingLine} };`
    );
  }

  it("defaults to DISABLED when omitted — opt-in for safety (HL7v2 traffic may carry PHI)", async () => {
    // Logging must be an explicit opt-in. Even though `msg` events
    // today only carry metadata (no message body), defaulting on a
    // healthcare-adjacent tool that writes to disk silently is a
    // footgun. The user opts in via `logging: true | "level" | {…}`.
    await writeMinimalConfig();
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging).toEqual({
      dir: resolve(dir, ".glion", "logs"),
      enabled: false,
      level: "info",
      maxFiles: 10,
    });
  });

  it("treats `logging: true` as the explicit opt-in with defaults", async () => {
    await writeMinimalConfig("true");
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.enabled).toBe(true);
    expect(resolved.logging.level).toBe("info");
  });

  it("treats `logging: false` as disabled", async () => {
    await writeMinimalConfig("false");
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.enabled).toBe(false);
  });

  it("accepts a LogLevel string as shorthand for level-only config", async () => {
    await writeMinimalConfig('"debug"');
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.enabled).toBe(true);
    expect(resolved.logging.level).toBe("debug");
    expect(resolved.logging.maxFiles).toBe(10);
  });

  it("rejects `silent` as a level — disabling is done via `logging: false`, not a fake level", async () => {
    // Design invariant: `enabled` is the ONLY way to turn logging
    // off. `silent` as a LogLevel would be a second, redundant
    // mechanism. Keep it out of the enum so the intent is enforced
    // at validation time rather than by downstream convention.
    await writeMinimalConfig('"silent"');
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-invalid",
    });
  });

  it("accepts the full object form and merges with defaults for unset fields", async () => {
    await writeMinimalConfig('{ level: "warn", maxFiles: 25 }');
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.enabled).toBe(true);
    expect(resolved.logging.level).toBe("warn");
    expect(resolved.logging.maxFiles).toBe(25);
    // Dir falls back to the default when not specified.
    expect(resolved.logging.dir).toBe(resolve(dir, ".glion", "logs"));
  });

  it("resolves a user-provided dir relative to the config file's directory", async () => {
    await writeMinimalConfig('{ dir: "./custom-logs" }');
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.dir).toBe(resolve(dir, "custom-logs"));
  });

  it("keeps an absolute user-provided dir unchanged", async () => {
    await writeMinimalConfig('{ dir: "/var/log/glion" }');
    const resolved = await loadConfig({ cacheDir, cwd: dir });
    expect(resolved.logging.dir).toBe("/var/log/glion");
  });

  it("rejects unknown fields in the object form", async () => {
    await writeMinimalConfig("{ oopsie: 42 }");
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-invalid",
    });
  });

  it("rejects an invalid LogLevel string", async () => {
    await writeMinimalConfig('"verbose"');
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-invalid",
    });
  });

  it('rejects `{ level: "silent" }` object form for the same reason', async () => {
    await writeMinimalConfig('{ level: "silent" }');
    await expect(loadConfig({ cacheDir, cwd: dir })).rejects.toMatchObject({
      kind: "config-invalid",
    });
  });
});
