#!/usr/bin/env node
// Markdown table of mutation scores for the GitHub job summary, from every
// packages/*/reports/stryker.json that exists.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packagesDir = fileURLToPath(new URL("../packages/", import.meta.url));
const rows = [];

const names = await readdir(packagesDir);

for (const name of names.toSorted()) {
  const reportPath = join(packagesDir, name, "reports", "stryker.json");
  let report;
  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch {
    // No report: the package is out of scope or was not mutated in this run.
    continue;
  }
  const configPath = pathToFileURL(
    join(packagesDir, name, "stryker.config.mjs")
  );
  const config = await import(configPath);
  const { thresholds } = config.default;
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
      const key = mutant.status.toLowerCase();
      if (key in counts) {
        counts[key] += 1;
      } else if (key === "compileerror" || key === "runtimeerror") {
        counts.error += 1;
      }
    }
  }
  const detected = counts.killed + counts.timeout;
  const undetected = counts.survived + counts.nocoverage;
  const score =
    detected + undetected === 0
      ? 0
      : (100 * detected) / (detected + undetected);
  let status = "✅";
  if (score < thresholds.break) {
    status = "❌";
  } else if (score < thresholds.low) {
    status = "⚠️";
  }
  rows.push(
    `| ${status} \`@glion/${name}\` | ${score.toFixed(2)}% | ${thresholds.break}% | ${counts.killed} | ${counts.timeout} | ${counts.survived} | ${counts.nocoverage} |`
  );
}

if (rows.length === 0) {
  process.stdout.write("No packages were mutated in this run.\n");
} else {
  process.stdout.write(
    [
      "## Mutation scores",
      "",
      "| Package | Score | Break | Killed | Timeout | Survived | No coverage |",
      "|---|---|---|---|---|---|---|",
      ...rows,
      "",
    ].join("\n")
  );
}
