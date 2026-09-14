#!/usr/bin/env node

// Usage:
//   glion-mutation-report [packagesDir] [--format text|markdown]
//
// Reads every packages/*/reports/stryker.json and prints one report. The
// format defaults to text on a terminal and markdown when piped. Links in
// the markdown come from the environment a GitHub Actions run provides
// (GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID) plus ARTIFACT_URL,
// HEAD_REF, and HEAD_SHA when the workflow sets them. Exits 1 when any
// package scored below its break threshold.

import { join } from "node:path";
import { parseArgs } from "node:util";

import { collectRows, formatMarkdown, formatText } from "./report.mjs";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { format: { type: "string" } },
});

const packagesDir = positionals[0] ?? join(process.cwd(), "packages");
const format = values.format ?? (process.stdout.isTTY ? "text" : "markdown");
if (format !== "text" && format !== "markdown") {
  process.stderr.write(
    `Unknown format "${format}"; expected text or markdown.\n`
  );
  process.exit(2);
}

const rows = await collectRows(packagesDir);

const { env } = process;
const runUrl =
  env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined;

process.stdout.write(
  format === "text"
    ? formatText(rows)
    : formatMarkdown(rows, {
        artifactUrl: env.ARTIFACT_URL,
        headRef: env.HEAD_REF,
        headSha: env.HEAD_SHA,
        runUrl,
      })
);

if (rows.some((row) => row.score < row.thresholds.break)) {
  process.exit(1);
}
