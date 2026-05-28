import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { describe, expect, it } from "vitest";

const binPath = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "index.js"
);

const packageJsonPath = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "package.json"
);

describe("glion --help and --version", () => {
  it("prints help text and exits 0 on --help", async () => {
    const result = await execa(process.execPath, [binPath, "--help"], {
      reject: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("glion");
    expect(result.stdout).toContain("dev");
    expect(result.stdout).toContain("start");
  });

  it("prints the actual package version on --version", async () => {
    const pkg = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      version: string;
    };
    const result = await execa(process.execPath, [binPath, "--version"], {
      reject: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`glion ${pkg.version}`);
  });

  it("accepts -v / -h short flags", async () => {
    const v = await execa(process.execPath, [binPath, "-v"], { reject: false });
    expect(v.exitCode).toBe(0);
    expect(v.stdout).toContain("glion ");
    const h = await execa(process.execPath, [binPath, "-h"], { reject: false });
    expect(h.exitCode).toBe(0);
    expect(h.stdout).toContain("Usage:");
  });

  it("prints help when no arguments are given", async () => {
    const result = await execa(process.execPath, [binPath], { reject: false });
    expect(result.stdout).toContain("glion");
  });

  it("exits 1 on unknown command", async () => {
    const result = await execa(process.execPath, [binPath, "bogus"], {
      reject: false,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown command");
  });

  it("accepts --config in any position", async () => {
    // `glion --config /nonexistent start` should route to runStart with
    // the flag parsed correctly, then fail because the path doesn't exist.
    // This proves the parser accepts flags before the subcommand.
    const result = await execa(
      process.execPath,
      [binPath, "--config", "/nonexistent/glion.config.ts", "start"],
      { reject: false }
    );
    expect(result.exitCode).toBe(1);
    // Should NOT be "unknown command --config" — it should have reached
    // the config loader and failed there.
    expect(result.stderr).not.toContain("unknown command");
  });

  it("rejects --config with no value", async () => {
    const result = await execa(
      process.execPath,
      [binPath, "start", "--config"],
      {
        reject: false,
      }
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--config");
  });
});
