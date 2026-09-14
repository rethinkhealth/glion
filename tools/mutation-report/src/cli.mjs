#!/usr/bin/env node

// Usage:
//   glion-mutation-report                # reads ./packages/*/reports/stryker.json
//   glion-mutation-report <packagesDir>  # reads the given directory
//
// Prints a Markdown table to stdout; exits 1 when any package scored below
// its break threshold, so the step can double as a gate if wanted.

import { join } from "node:path";

import { collectRows, formatTable } from "./report.mjs";

const packagesDir = process.argv[2] ?? join(process.cwd(), "packages");
const rows = await collectRows(packagesDir);

process.stdout.write(formatTable(rows));

if (rows.some((row) => row.score < row.thresholds.break)) {
  process.exit(1);
}
