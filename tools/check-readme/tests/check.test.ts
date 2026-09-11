/**
 * @module @glion/check-readme/test
 * @file Tests for `@glion/check-readme`'s core check logic. Each scenario
 *   materialises a disposable package directory under the OS temp directory via
 *   {@link setupPackage}, runs the real {@link checkPackage} against the
 *   filesystem (no mocks, no stubs), asserts on the structured result, and
 *   tears the directory down in a `finally` block so failures never leak disk
 *   state. Uses vitest to match the rest of the workspace so the package
 *   participates cleanly in `pnpm test:coverage`. Run via
 *   `pnpm --filter @glion/check-readme test` or `pnpm turbo run test`.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vitest";

import { checkPackage } from "../src/check.mjs";

/**
 * @typedef {object} PackageSpec
 * @property {object} pkgJson Object serialised verbatim as `package.json`.
 * @property {string} [readme] Optional README.md contents. Omit the property entirely to
 *   simulate a package that ships without a README — the difference
 *   from an empty string matters because the absent case exercises
 *   the "missing README.md" failure path.
 */

/**
 * @typedef {object} PackageHandle
 * @property {string} dir Absolute path to the package directory. Pass directly to
 *   {@link checkPackage}.
 * @property {() => void} cleanup Removes the package directory tree. Call in a
 *   `finally` block.
 */

/**
 * Materialise a single synthetic package directory under the OS temp
 * directory.
 *
 * @param {PackageSpec} spec Declarative description of the package to
 *   materialise.
 * @returns {PackageHandle} Handle exposing the package directory path and a cleanup function
 *   that removes the temp directory.
 */
function setupPackage(spec: { pkgJson: object; readme?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "glion-check-readme-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(spec.pkgJson, null, 2)
  );
  if (spec.readme !== undefined) {
    writeFileSync(join(dir, "README.md"), spec.readme);
  }
  return {
    cleanup: () => rmSync(dir, { force: true, recursive: true }),
    dir,
  };
}

/**
 * Build a README string that satisfies every current rule. Tests derive
 * failing variants by `.replace()`-ing out one section at a time so the
 * reported failure is attributable to that removal alone.
 *
 * @param {string} name The fully-qualified package name used as the title of the
 *   generated README (keeps the title-match check satisfied by
 *   default).
 * @returns {string} Compliant README markdown content.
 */
function compliantReadme(name: string) {
  return `# ${name}

> A one-sentence description.

## What it does

Some prose.

## Install

\`\`\`bash
pnpm add ${name}
\`\`\`

## Use

\`\`\`ts
// example
\`\`\`

## Part of Glion

Footer content.
`;
}

// --------------------------------------------------------------------
// Happy path
// --------------------------------------------------------------------

test("compliant README passes check", () => {
  const pkg = setupPackage({
    pkgJson: { name: "@glion/demo" },
    readme: compliantReadme("@glion/demo"),
  });
  try {
    const result = checkPackage(pkg.dir);
    assert.equal(result.name, "@glion/demo");
    assert.equal(result.skipped, false);
    assert.deepEqual(result.failures, []);
  } finally {
    pkg.cleanup();
  }
});

// --------------------------------------------------------------------
// Missing file / missing section failures
// --------------------------------------------------------------------

test("missing README fails", () => {
  const pkg = setupPackage({ pkgJson: { name: "@glion/demo" } });
  try {
    const result = checkPackage(pkg.dir);
    assert.equal(result.skipped, false);
    assert.match(result.failures.join(" | "), /missing README\.md/);
  } finally {
    pkg.cleanup();
  }
});

test("README missing ## Install fails", () => {
  const readme = compliantReadme("@glion/demo").replace(
    /## Install[\s\S]+?## Use/,
    "## Use"
  );
  const pkg = setupPackage({ pkgJson: { name: "@glion/demo" }, readme });
  try {
    const result = checkPackage(pkg.dir);
    assert.match(result.failures.join(" | "), /## Install/);
  } finally {
    pkg.cleanup();
  }
});

test("README missing ## Use fails", () => {
  const readme = compliantReadme("@glion/demo").replace(
    /## Use[\s\S]+?## Part of Glion/,
    "## Part of Glion"
  );
  const pkg = setupPackage({ pkgJson: { name: "@glion/demo" }, readme });
  try {
    const result = checkPackage(pkg.dir);
    assert.match(result.failures.join(" | "), /## Use/);
  } finally {
    pkg.cleanup();
  }
});

test("README missing ## Part of Glion fails", () => {
  const readme = compliantReadme("@glion/demo").replace(
    /## Part of Glion[\s\S]+$/,
    ""
  );
  const pkg = setupPackage({ pkgJson: { name: "@glion/demo" }, readme });
  try {
    const result = checkPackage(pkg.dir);
    assert.match(result.failures.join(" | "), /## Part of Glion/);
  } finally {
    pkg.cleanup();
  }
});

// --------------------------------------------------------------------
// Title match
// --------------------------------------------------------------------

test("title mismatch names both actual and expected", () => {
  const pkg = setupPackage({
    pkgJson: { name: "@glion/demo" },
    readme: compliantReadme("@glion/wrong-name"),
  });
  try {
    const result = checkPackage(pkg.dir);
    const joined = result.failures.join(" | ");
    assert.match(joined, /@glion\/wrong-name/);
    assert.match(joined, /@glion\/demo/);
  } finally {
    pkg.cleanup();
  }
});

// --------------------------------------------------------------------
// Private-package opt-out
// --------------------------------------------------------------------

test("private package with no README is skipped, not failed", () => {
  const pkg = setupPackage({
    pkgJson: { name: "@glion/internal", private: true },
  });
  try {
    const result = checkPackage(pkg.dir);
    assert.equal(result.skipped, true);
    assert.deepEqual(result.failures, []);
  } finally {
    pkg.cleanup();
  }
});

// --------------------------------------------------------------------
// Graceful failure when package.json is unreadable
// --------------------------------------------------------------------

test("unreadable package.json surfaces failure with dir as name", () => {
  const dir = mkdtempSync(join(tmpdir(), "glion-check-readme-"));
  try {
    // No package.json written; this simulates a stray directory.
    const result = checkPackage(dir);
    assert.equal(result.skipped, false);
    assert.match(result.failures.join(" | "), /failed to read package\.json/);
    assert.equal(result.name, dir);
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
});
