/**
 * @module @glion/check-release/check
 * @file Compares public workspace packages against the npm registry.
 */

/**
 * A workspace package as listed by `pnpm ls --recursive --depth -1 --json`.
 *
 * @typedef {object} WorkspacePackage
 * @property {string} name The `name` field of the package.
 * @property {string} version The `version` field of the package.
 * @property {boolean} [private] The `private` field of the package.
 */

/**
 * The subset of an npm packument the check reads.
 *
 * @typedef {object} Packument
 * @property {Record<
 *   string,
 *   { dist?: { attestations?: { provenance?: object } } }
 * >} versions
 *   Published versions keyed by version string.
 */

/**
 * Resolves the packument for `name`, or `null` when the registry has no such
 * package.
 *
 * MUST reject on any other registry failure.
 *
 * @callback FetchPackument
 * @param {string} name The package name.
 * @returns {Promise<Packument | null>} The packument, or `null` when the
 *   package does not exist.
 */

/**
 * One public package whose workspace version is not fully released.
 *
 * `missing-package`: the registry has no package of that name.
 * `missing-version`: the package exists but not at the workspace version.
 * `missing-provenance`: the version exists without a provenance attestation.
 *
 * @typedef {object} Finding
 * @property {string} name The package name.
 * @property {string} version The workspace version that was checked.
 * @property {"missing-package" | "missing-version" | "missing-provenance"} status
 *   What the registry lacks.
 */

/**
 * The findings for every public package in `packages`, in input order.
 *
 * Private packages are skipped. Resolves to an empty array when every public
 * package's workspace version is on the registry with provenance. Rejects
 * when `fetchPackument` rejects.
 *
 * @param {readonly WorkspacePackage[]} packages The workspace packages to
 *   check.
 * @param {FetchPackument} fetchPackument The registry lookup.
 * @returns {Promise<Finding[]>} One finding per public package that is not
 *   fully released.
 */
export async function checkRelease(packages, fetchPackument) {
  const publicPackages = packages.filter((pkg) => pkg.private !== true);
  const results = await Promise.all(
    publicPackages.map(async ({ name, version }) => {
      const packument = await fetchPackument(name);
      if (packument === null) {
        return { name, status: "missing-package", version };
      }
      const published = packument.versions[version];
      if (published === undefined) {
        return { name, status: "missing-version", version };
      }
      if (published.dist?.attestations?.provenance === undefined) {
        return { name, status: "missing-provenance", version };
      }
      return null;
    })
  );
  return results.filter((finding) => finding !== null);
}
