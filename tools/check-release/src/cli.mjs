#!/usr/bin/env node

/**
 * @module @glion/check-release/cli
 * @file CLI entrypoint for `glion-check-release`.
 *   Lists the workspace with pnpm, queries the npm registry for every public
 *   package, and exits with code 1 when any workspace version is missing from
 *   the registry or lacks provenance.
 */

import { execFileSync } from "node:child_process";

import { checkRelease } from "./check.mjs";

const REGISTRY_URL = "https://registry.npmjs.org";
const ABBREVIATED_PACKUMENT = "application/vnd.npm.install-v1+json";

/** @type {import("./check.mjs").FetchPackument} */
async function fetchPackument(name) {
  const response = await fetch(`${REGISTRY_URL}/${name.replace("/", "%2f")}`, {
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
  }
}

/** @type {import("./check.mjs").WorkspacePackage[]} */
const packages = JSON.parse(
  execFileSync("pnpm", ["ls", "--recursive", "--depth", "-1", "--json"], {
    encoding: "utf8",
  })
);

const findings = await checkRelease(packages, fetchPackument);
const checked = packages.filter((pkg) => pkg.private !== true).length;

if (findings.length === 0) {
  console.log(`✓ ${checked} public packages are on npm with provenance`);
  process.exit(0);
}

console.error(
  `✗ ${findings.length} of ${checked} public packages are not fully released:`
);
for (const finding of findings) {
  console.error(`  - ${describe(finding)}`);
}
process.exit(1);
