import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const PERCENT = 100;
const SURVIVORS_SHOWN_PER_PACKAGE = 25;
const STATUS = { belowFloor: "❌", belowTarget: "⚠️", onTarget: "✅" };
const UNDETECTED = new Set(["Survived", "NoCoverage"]);
const DETECTED = new Set(["Killed", "Timeout"]);
const TEXT_STATUS = {
  [STATUS.belowFloor]: "FAIL",
  [STATUS.belowTarget]: "pass",
  [STATUS.onTarget]: "good",
};

// Stryker's mutation score: detected over detected plus undetected. Ignored
// mutants and compile or runtime errors are outside the denominator.
const COUNTER_FOR_STATUS = {
  Ignored: "ignored",
  Killed: "killed",
  NoCoverage: "noCoverage",
  Survived: "survived",
  Timeout: "timeout",
};

export function summarize(report) {
  const counts = {
    detected: 0,
    errors: 0,
    ignored: 0,
    killed: 0,
    noCoverage: 0,
    survived: 0,
    timeout: 0,
  };
  const survivors = [];
  for (const [file, { mutants }] of Object.entries(report.files)) {
    for (const mutant of mutants) {
      const { status } = mutant;
      counts[COUNTER_FOR_STATUS[status] ?? "errors"] += 1;
      if (DETECTED.has(status)) {
        counts.detected += 1;
      }
      if (UNDETECTED.has(status)) {
        survivors.push({
          covered: status === "Survived",
          file,
          line: mutant.location.start.line,
          mutator: mutant.mutatorName,
          replacement: mutant.replacement,
        });
      }
    }
  }
  const undetected = counts.survived + counts.noCoverage;
  const total = counts.detected + undetected;
  const score = total === 0 ? 0 : (PERCENT * counts.detected) / total;
  return {
    ...counts,
    frameworkVersion: report.framework?.version,
    score,
    survivors,
    thresholds: report.thresholds,
    total,
  };
}

export function statusFor(score, thresholds) {
  if (score < thresholds.break) {
    return STATUS.belowFloor;
  }
  if (score < thresholds.high) {
    return STATUS.belowTarget;
  }
  return STATUS.onTarget;
}

// One row per package directory holding a Stryker JSON report. Packages
// without one were not mutated in this run and are omitted, not zeroed.
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
    rows.push({ name, ...summarize(report) });
  }
  return rows;
}

function headline(rows) {
  const below = rows.filter((row) => row.score < row.thresholds.break);
  if (rows.length === 0) {
    return "No packages were mutated in this run";
  }
  if (below.length === 0) {
    return `All ${rows.length} mutated package${rows.length === 1 ? "" : "s"} hold their floor`;
  }
  return `${below.length} of ${rows.length} mutated packages fell below their floor`;
}

function totals(rows) {
  const sum = { detected: 0, noCoverage: 0, survived: 0, total: 0 };
  for (const row of rows) {
    sum.detected += row.detected;
    sum.noCoverage += row.noCoverage;
    sum.survived += row.survived;
    sum.total += row.total;
  }
  return sum;
}

function percent(value) {
  return `${value.toFixed(2)}%`;
}

function survivorsSection(rows) {
  const lines = [];
  for (const row of rows) {
    if (row.survivors.length === 0) {
      continue;
    }
    lines.push(
      "",
      `#### \`@glion/${row.name}\`: ${row.survived} survived, ${row.noCoverage} not covered by any test`,
      "",
      "| Location | Mutator | Replaced with | Covered |",
      "|---|---|---|---|"
    );
    const shown = row.survivors.slice(0, SURVIVORS_SHOWN_PER_PACKAGE);
    for (const mutant of shown) {
      const replacement = mutant.replacement
        .replaceAll("\n", " ")
        .replaceAll("|", "\\|");
      lines.push(
        `| \`${mutant.file}:${mutant.line}\` | ${mutant.mutator} | \`${replacement}\` | ${mutant.covered ? "yes" : "no"} |`
      );
    }
    const hidden = row.survivors.length - shown.length;
    if (hidden > 0) {
      lines.push("", `…and ${hidden} more in the package's HTML report.`);
    }
  }
  return lines;
}

function countersLines(rows) {
  const sum = totals(rows);
  const counts = { belowFloor: 0, belowTarget: 0, onTarget: 0 };
  for (const row of rows) {
    const status = statusFor(row.score, row.thresholds);
    if (status === STATUS.belowFloor) {
      counts.belowFloor += 1;
    } else if (status === STATUS.belowTarget) {
      counts.belowTarget += 1;
    } else {
      counts.onTarget += 1;
    }
  }
  return [
    `${STATUS.onTarget} **${counts.onTarget}** on target · ${STATUS.belowTarget} **${counts.belowTarget}** above floor, below target · ${STATUS.belowFloor} **${counts.belowFloor}** below floor`,
    "",
    `**${sum.total}** mutants · **${sum.detected}** detected · **${sum.survived}** survived · **${sum.noCoverage}** not covered by any test`,
  ];
}

function tableLines(rows) {
  const lines = [
    "| Package | Score | Floor | Target | Mutants | Detected | Survived | Not covered |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${statusFor(row.score, row.thresholds)} \`@glion/${row.name}\` | **${percent(row.score)}** | ${row.thresholds.break}% | ${row.thresholds.high}% | ${row.total} | ${row.detected} | ${row.survived} | ${row.noCoverage} |`
    );
  }
  return lines;
}

function detailsLines(rows) {
  const sum = totals(rows);
  const survivorCount = sum.survived + sum.noCoverage;
  if (survivorCount === 0) {
    return [];
  }
  return [
    "",
    "<details>",
    `<summary><b>${survivorCount} undetected mutant${survivorCount === 1 ? "" : "s"}</b>: each is a change to the source that no test noticed</summary>`,
    ...survivorsSection(rows),
    "",
    "</details>",
  ];
}

function linksLine(meta) {
  const links = [];
  if (meta.headRef && meta.headSha) {
    links.push(`Head \`${meta.headRef}\` (\`${meta.headSha.slice(0, 7)}\`)`);
  }
  if (meta.runUrl) {
    links.push(`[Workflow run](${meta.runUrl})`);
  }
  if (meta.artifactUrl) {
    links.push(
      `[Download the full reports](${meta.artifactUrl}) (open \`packages/<name>/reports/mutation/index.html\`)`
    );
  }
  return links.length === 0 ? [] : ["", links.join(" · ")];
}

function footnote(version) {
  return `<sub>Generated by <code>pnpm mutate:report</code> (<code>@glion/mutation-report</code>) from the JSON reports StrykerJS${version ? ` ${version}` : ""} writes per package. A mutant is one small change to the source, such as a flipped comparison or a deleted statement; the tests run against each one, and a mutant no test fails on has survived. Score is detected ÷ (detected + survived + not covered); ignored mutants and errors are excluded. Floor is the package's <code>break</code> threshold, below which the run fails and which is only ever raised; target is its <code>high</code> threshold. Why glion gates on this: <a href="https://github.com/rethinkhealth/glion/blob/main/docs/adr/0022-mutation-testing.md">ADR 0022</a>. How to triage a survivor: <a href="https://github.com/rethinkhealth/glion/blob/main/docs/contributing/mutation-testing.md">docs/contributing/mutation-testing.md</a>.</sub>`;
}

// Markdown for a pull-request comment or job summary. `meta` carries the
// links and identity the CI run knows and the report files do not.
export function formatMarkdown(rows, meta = {}) {
  const version = rows.find((row) => row.frameworkVersion)?.frameworkVersion;
  const body =
    rows.length === 0
      ? []
      : [
          ...countersLines(rows),
          "",
          ...tableLines(rows),
          ...detailsLines(rows),
        ];
  return [
    `## Mutation testing: ${headline(rows)}`,
    "",
    ...body,
    ...linksLine(meta),
    "",
    "---",
    "",
    footnote(version),
    "",
  ].join("\n");
}

function pad(value, width, align = "left") {
  const text = String(value);
  return align === "right" ? text.padStart(width) : text.padEnd(width);
}

// Plain text for a terminal: aligned columns, one line per package.
export function formatText(rows) {
  if (rows.length === 0) {
    return "No packages were mutated in this run.\n";
  }
  const columns = [
    { align: "left", key: "status", title: "Status" },
    { align: "left", key: "package", title: "Package" },
    { align: "right", key: "score", title: "Score" },
    { align: "right", key: "floor", title: "Floor" },
    { align: "right", key: "total", title: "Mutants" },
    { align: "right", key: "detected", title: "Detected" },
    { align: "right", key: "survived", title: "Survived" },
    { align: "right", key: "noCoverage", title: "Not covered" },
  ];
  const cells = rows.map((row) => ({
    detected: row.detected,
    floor: `${row.thresholds.break}%`,
    noCoverage: row.noCoverage,
    package: `@glion/${row.name}`,
    score: percent(row.score),
    status: TEXT_STATUS[statusFor(row.score, row.thresholds)],
    survived: row.survived,
    total: row.total,
  }));
  const widths = Object.fromEntries(
    columns.map((column) => [
      column.key,
      Math.max(
        column.title.length,
        ...cells.map((cell) => String(cell[column.key]).length)
      ),
    ])
  );
  const line = (cell) =>
    columns
      .map((column) => pad(cell[column.key], widths[column.key], column.align))
      .join("  ");
  const sum = totals(rows);
  return [
    line(
      Object.fromEntries(columns.map((column) => [column.key, column.title]))
    ),
    line(
      Object.fromEntries(
        columns.map((column) => [column.key, "-".repeat(widths[column.key])])
      )
    ),
    ...cells.map(line),
    "",
    `${headline(rows)}. ${sum.total} mutants, ${sum.detected} detected, ${sum.survived + sum.noCoverage} undetected.`,
    "Survivors are listed in each package's reports/mutation/index.html; pass --format markdown for the full table.",
    "",
  ].join("\n");
}
