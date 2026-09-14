import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectRows,
  formatTable,
  scoreReport,
  statusFor,
} from "../src/report.mjs";

const report = (statuses: string[]) => ({
  files: {
    "src/index.ts": { mutants: statuses.map((status) => ({ status })) },
  },
});

describe("scoreReport", () => {
  it("counts detected over detected plus undetected", () => {
    const result = scoreReport(
      report(["Killed", "Killed", "Timeout", "Survived", "NoCoverage"])
    );
    expect(result).toMatchObject({
      killed: 2,
      nocoverage: 1,
      score: 60,
      survived: 1,
      timeout: 1,
    });
  });

  it("leaves ignored mutants and errors out of the score", () => {
    const result = scoreReport(
      report(["Killed", "Ignored", "CompileError", "RuntimeError"])
    );
    expect(result).toMatchObject({ error: 2, ignored: 1, score: 100 });
  });

  it("scores an empty report as zero", () => {
    expect(scoreReport({ files: {} }).score).toBe(0);
  });
});

describe("statusFor", () => {
  const thresholds = { break: 75, high: 85, low: 70 };

  it("fails below break, warns below low, passes otherwise", () => {
    expect(statusFor(74.99, thresholds)).toBe("❌");
    expect(statusFor(75, { ...thresholds, low: 80 })).toBe("⚠️");
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
    await writeFile(
      join(packages, "alpha", "stryker.config.mjs"),
      "export default { thresholds: { break: 40, high: 85, low: 70 } };\n"
    );
    await mkdir(join(packages, "beta"));

    const rows = await collectRows(packages);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "alpha",
      score: 50,
      thresholds: { break: 40 },
    });
  });
});

describe("formatTable", () => {
  it("renders a header and one line per row with the status marker", () => {
    const table = formatTable([
      {
        killed: 9,
        name: "parser",
        nocoverage: 0,
        score: 90,
        survived: 1,
        thresholds: { break: 75, high: 85, low: 70 },
        timeout: 0,
      },
    ]);
    expect(table).toContain("## Mutation scores");
    expect(table).toContain(
      "| ✅ `@glion/parser` | 90.00% | 75% | 9 | 0 | 1 | 0 |"
    );
  });

  it("says so when nothing was mutated", () => {
    expect(formatTable([])).toBe("No packages were mutated in this run.\n");
  });
});
