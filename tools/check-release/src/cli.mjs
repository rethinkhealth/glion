#!/usr/bin/env node

/**
 * @module @glion/check-release/cli
 * @file CLI entrypoint for `glion-check-release`.
 *   Lists the workspace with pnpm and queries the npm registry for every
 *   public package and every package in the `@glion` scope. Exits with code 0
 *   when the registry matches the workspace, 1 when it reports findings, and
 *   2 when the workspace or the registry could not be read.
 */

import { execFileSync } from "node:child_process";

import { checkRelease } from "./check.mjs";

const REGISTRY_URL = "https://registry.npmjs.org";
const SCOPE = "glion";
const ABBREVIATED_PACKUMENT = "application/vnd.npm.install-v1+json";
const EXIT_FINDINGS = 1;
const EXIT_UNCHECKED = 2;

/**
 * The names of every package in the registry scope.
 *
 * @returns {Promise<string[]>} The package names.
 */
async function fetchScopePackages() {
  const response = await fetch(`${REGISTRY_URL}/-/org/${SCOPE}/package`);
  if (!response.ok) {
    throw new Error(
      `registry returned ${response.status} ${response.statusText} for the @${SCOPE} scope`
    );
  }
  return Object.keys(await response.json());
}

/** @type {import("./check.mjs").FetchPackument} */
async function fetchPackument(name) {
  const response = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
    headers: { accept: ABBREVIATED_PACKUMENT },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `registry returned ${response.status} ${response.statusText} for ${name}`
    );
  }
  return response.json();
}

/**
 * The one-line report for a finding, with the action that clears it.
 *
 * @param {import("./check.mjs").Finding} finding The finding to describe.
 * @returns {string} The report line.
 */
function describe(finding) {
  switch (finding.status) {
    case "missing-package": {
      return `${finding.name} is not on the registry; publish ${finding.version} once from a maintainer account, then add a trusted publisher`;
    }
    case "missing-version": {
      return `${finding.name}@${finding.version} is not on the registry; check the last Changesets publish run`;
    }
    case "missing-provenance": {
      return `${finding.name}@${finding.version} has no provenance attestation; it was not published by the release workflow`;
    }
    case "deprecated": {
      return `${finding.name}@${finding.version} is deprecated on the registry; run \`npm deprecate ${finding.name}@${finding.version} ""\` from a maintainer account if it was deprecated by mistake`;
    }
    case "not-deprecated": {
      return `${finding.name} (latest ${finding.version}) is not a public workspace package and has versions that are not deprecated; run \`npm deprecate ${finding.name} "<reason>"\` from a maintainer account`;
    }
  }
}

/**
 * The findings for the workspace against the registry, and the number of
 * public packages checked.
 *
 * @returns {Promise<{
 *   checked: number;
 *   findings: import("./check.mjs").Finding[];
 * }>}
 *   The comparison.
 */
async function compare() {
  /** @type {import("./check.mjs").WorkspacePackage[]} */
  const packages = JSON.parse(
    execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
      encoding: "utf8",
    })
  );
  const findings = await checkRelease(
    packages,
    await fetchScopePackages(),
    fetchPackument
  );
  return {
    checked: packages.filter((pkg) => pkg.private !== true).length,
    findings,
  };
}

const { checked, findings } = await compare().catch((error) => {
  console.error("✗ Could not compare the workspace with the registry:");
  console.error(error);
  process.exit(EXIT_UNCHECKED);
});

if (findings.length === 0) {
  console.log(
    `✓ ${checked} public packages are on npm with provenance, and every other @${SCOPE} package is deprecated`
  );
  process.exit(0);
}

console.error(`✗ ${findings.length} packages do not match the workspace:`);
for (const finding of findings) {
  console.error(`  - ${describe(finding)}`);
}
process.exit(EXIT_FINDINGS);
