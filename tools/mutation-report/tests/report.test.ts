import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectRows,
  formatMarkdown,
  formatText,
  statusFor,
  summarize,
} from "../src/report.mjs";

const thresholds = { break: 75, high: 85, low: 70 };

const mutant = (
  status: string,
  line = 1,
  mutator = "ConditionalExpression"
) => ({
  location: { end: { column: 2, line }, start: { column: 1, line } },
  mutatorName: mutator,
  replacement: "false",
  status,
});

const report = (statuses: string[], overrides: object = {}) => ({
  files: {
    "src/index.ts": {
      mutants: statuses.map((status, i) => mutant(status, i + 1)),
    },
  },
  framework: { name: "StrykerJS", version: "10.0.0" },
  thresholds,
  ...overrides,
});

const row = (name: string, statuses: string[]) => ({
  name,
  ...summarize(report(statuses)),
});

describe("summarize", () => {
  it("scores detected over detected plus undetected", () => {
    const result = summarize(
      report(["Killed", "Killed", "Timeout", "Survived", "NoCoverage"])
    );
    expect(result).toMatchObject({
      detected: 3,
      killed: 2,
      noCoverage: 1,
      score: 60,
      survived: 1,
      timeout: 1,
      total: 5,
    });
  });

  it("leaves ignored mutants and errors out of the score", () => {
    const result = summarize(
      report(["Killed", "Ignored", "CompileError", "RuntimeError"])
    );
    expect(result).toMatchObject({
      errors: 2,
      ignored: 1,
      score: 100,
      total: 1,
    });
  });

  it("lists each undetected mutant with its location and whether a test covered it", () => {
    const result = summarize(report(["Killed", "Survived", "NoCoverage"]));
    expect(result.survivors).toEqual([
      {
        covered: true,
        file: "src/index.ts",
        line: 2,
        mutator: "ConditionalExpression",
        replacement: "false",
      },
      {
        covered: false,
        file: "src/index.ts",
        line: 3,
        mutator: "ConditionalExpression",
        replacement: "false",
      },
    ]);
  });

  it("carries the thresholds and framework version from the report", () => {
    const result = summarize(report(["Killed"]));
    expect(result.thresholds).toEqual(thresholds);
    expect(result.frameworkVersion).toBe("10.0.0");
  });

  it("scores an empty report as zero", () => {
    expect(summarize(report([])).score).toBe(0);
  });
});

describe("statusFor", () => {
  it("marks below floor, between floor and target, and on target", () => {
    expect(statusFor(74.99, thresholds)).toBe("❌");
    expect(statusFor(75, thresholds)).toBe("⚠️");
    expect(statusFor(84.99, thresholds)).toBe("⚠️");
    expect(statusFor(85, thresholds)).toBe("✅");
  });
});

describe("collectRows", () => {
  it("reads one row per package with a report and skips the rest", async () => {
    const packages = await mkdtemp(join(tmpdir(), "mutation-report-"));
    await mkdir(join(packages, "alpha", "reports"), { recursive: true });
    await writeFile(
      join(packages, "alpha", "reports", "stryker.json"),
      JSON.stringify(report(["Killed", "Survived"]))
    );
    await mkdir(join(packages, "beta"));

    const rows = await collectRows(packages);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "alpha", score: 50, thresholds });
  });
});

describe("formatMarkdown", () => {
  it("leads with a headline, counters, and one table row per package", () => {
    const md = formatMarkdown([
      row("parser", [
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Killed",
        "Survived",
      ]),
      row("codec", ["Killed", "Survived"]),
    ]);
    expect(md).toContain(
      "## Mutation testing: 1 of 2 mutated packages fell below their floor"
    );
    expect(md).toContain("✅ **1** on target");
    expect(md).toContain("❌ **1** below floor");
    expect(md).toContain("**12** mutants · **10** detected · **2** survived");
    expect(md).toContain(
      "| ✅ `@glion/parser` | **90.00%** | 75% | 85% | 10 | 9 | 1 | 0 |"
    );
    expect(md).toContain(
      "| ❌ `@glion/codec` | **50.00%** | 75% | 85% | 2 | 1 | 1 | 0 |"
    );
  });

  it("lists undetected mutants per package inside a details block", () => {
    const md = formatMarkdown([
      row("parser", ["Killed", "Survived", "NoCoverage"]),
    ]);
    expect(md).toContain("<details>");
    expect(md).toContain("<summary><b>2 undetected mutants</b>");
    expect(md).toContain(
      "#### `@glion/parser`: 1 survived, 1 not covered by any test"
    );
    expect(md).toContain(
      "| `src/index.ts:2` | ConditionalExpression | `false` | yes |"
    );
    expect(md).toContain(
      "| `src/index.ts:3` | ConditionalExpression | `false` | no |"
    );
  });

  it("omits the details block when everything was detected", () => {
    const md = formatMarkdown([row("parser", ["Killed"])]);
    expect(md).not.toContain("<details>");
    expect(md).toContain("All 1 mutated package hold their floor");
  });

  it("links the run, the head, and the artifact when given", () => {
    const md = formatMarkdown([row("parser", ["Killed"])], {
      artifactUrl: "https://example.test/artifact",
      headRef: "feature",
      headSha: "0123456789abcdef",
      runUrl: "https://example.test/run",
    });
    expect(md).toContain(
      "Head `feature` (`0123456`) · [Workflow run](https://example.test/run) · [Download the full reports](https://example.test/artifact)"
    );
  });

  it("ends with a footnote naming the tool, the Stryker version, and the score definition", () => {
    const md = formatMarkdown([row("parser", ["Killed"])]);
    expect(md).toContain("<sub>Generated by <code>pnpm mutate:report</code>");
    expect(md).toContain("StrykerJS 10.0.0");
    expect(md).toContain("ADR 0022");
  });

  it("says so when nothing was mutated", () => {
    expect(formatMarkdown([])).toContain(
      "## Mutation testing: No packages were mutated in this run"
    );
  });
});

describe("formatText", () => {
  it("aligns columns and closes with the headline", () => {
    const text = formatText([
      row("parser", ["Killed", "Killed", "Killed", "Survived"]),
      row("to-hl7v2", ["Killed"]),
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(
      /^Status\s+Package\s+Score\s+Floor\s+Mutants\s+Detected\s+Survived\s+Not covered$/
    );
    expect(lines[2]).toMatch(
      /^pass\s+@glion\/parser\s+75\.00%\s+75%\s+4\s+3\s+1\s+0$/
    );
    expect(lines[3]).toMatch(
      /^good\s+@glion\/to-hl7v2\s+100\.00%\s+75%\s+1\s+1\s+0\s+0$/
    );
    expect(text).toContain(
      "All 2 mutated packages hold their floor. 5 mutants, 4 detected, 1 undetected."
    );
  });

  it("says so when nothing was mutated", () => {
    expect(formatText([])).toBe("No packages were mutated in this run.\n");
  });
});
