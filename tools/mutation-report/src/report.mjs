import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PERCENT = 100;

// Stryker's mutation score: detected over detected plus undetected. Ignored
// mutants and compile or runtime errors are outside the denominator.
export function scoreReport(report) {
  const counts = {
    error: 0,
    ignored: 0,
    killed: 0,
    nocoverage: 0,
    survived: 0,
    timeout: 0,
  };
  for (const file of Object.values(report.files)) {
    for (const mutant of file.mutants) {
      const status = mutant.status.toLowerCase();
      if (status in counts) {
        counts[status] += 1;
      } else if (status === "compileerror" || status === "runtimeerror") {
        counts.error += 1;
      }
    }
  }
  const detected = counts.killed + counts.timeout;
  const undetected = counts.survived + counts.nocoverage;
  const total = detected + undetected;
  const score = total === 0 ? 0 : (PERCENT * detected) / total;
  return { ...counts, score };
}

export function statusFor(score, thresholds) {
  if (score < thresholds.break) {
    return "❌";
  }
  if (score < thresholds.low) {
    return "⚠️";
  }
  return "✅";
}

// One row per package directory that holds both a Stryker JSON report and a
// stryker.config.mjs. Packages without a report were not mutated in this run
// and are omitted rather than shown as zero.
export async function collectRows(packagesDir) {
  const rows = [];
  const names = await readdir(packagesDir);
  for (const name of names.toSorted()) {
    let report;
    try {
      report = JSON.parse(
        await readFile(
          join(packagesDir, name, "reports", "stryker.json"),
          "utf8"
        )
      );
    } catch {
      continue;
    }
    const config = await import(
      pathToFileURL(join(packagesDir, name, "stryker.config.mjs"))
    );
    const { thresholds } = config.default;
    rows.push({ name, thresholds, ...scoreReport(report) });
  }
  return rows;
}

export function formatTable(rows) {
  if (rows.length === 0) {
    return "No packages were mutated in this run.\n";
  }
  const lines = [
    "## Mutation scores",
    "",
    "| Package | Score | Break | Killed | Timeout | Survived | No coverage |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    const status = statusFor(row.score, row.thresholds);
    lines.push(
      `| ${status} \`@glion/${row.name}\` | ${row.score.toFixed(2)}% | ${row.thresholds.break}% | ${row.killed} | ${row.timeout} | ${row.survived} | ${row.nocoverage} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}
