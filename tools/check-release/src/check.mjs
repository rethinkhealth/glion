/**
 * @module @glion/check-release/check
 * @file Compares public workspace packages against the npm registry, both
 * ways.
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
 * @property {{ latest: string }} dist-tags The distribution tags.
 * @property {Record<
 *   string,
 *   {
 *     deprecated?: string;
 *     dist?: { attestations?: { provenance?: object } };
 *   }
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
 * One package on which the workspace and the registry disagree.
 *
 * `missing-package`: the registry has no package of that name.
 * `missing-version`: the package exists but not at the workspace version.
 * `missing-provenance`: the version exists without a provenance attestation.
 * `deprecated`: the version exists and is deprecated.
 * `not-deprecated`: the package is in the registry scope but not a public
 * workspace package, and at least one of its versions is not deprecated.
 *
 * @typedef {object} Finding
 * @property {string} name The package name.
 * @property {string} version The workspace version that was checked, or the
 *   registry's `latest` version for `not-deprecated`.
 * @property {"missing-package"
 *   | "missing-version"
 *   | "missing-provenance"
 *   | "deprecated"
 *   | "not-deprecated"} status
 *   How the registry differs from the workspace.
 */

/**
 * The findings for every public package in `packages`, in input order,
 * followed by the findings for every package in `scopePackages` that is not a
 * public workspace package, in name order.
 *
 * Resolves to an empty array when every public package's workspace version is
 * on the registry with provenance and not deprecated, and every version of
 * every other package in the scope, private workspace packages included, is
 * deprecated. Rejects when `fetchPackument` rejects.
 *
 * @param {readonly WorkspacePackage[]} packages The workspace packages to
 *   check.
 * @param {readonly string[]} scopePackages The names of every package the
 *   registry lists in the scope.
 * @param {FetchPackument} fetchPackument The registry lookup.
 * @returns {Promise<Finding[]>} One finding per package on which the workspace
 *   and the registry disagree.
 */
export async function checkRelease(packages, scopePackages, fetchPackument) {
  const publicPackages = packages.filter((pkg) => pkg.private !== true);
  const publicNames = new Set(publicPackages.map(({ name }) => name));
  const removedPackages = scopePackages
    .filter((name) => !publicNames.has(name))
    .toSorted();
  const released = await Promise.all(
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
      if (published.deprecated) {
        return { name, status: "deprecated", version };
      }
      return null;
    })
  );
  const removed = await Promise.all(
    removedPackages.map(async (name) => {
      const packument = await fetchPackument(name);
      if (
        packument === null ||
        Object.values(packument.versions).every(({ deprecated }) => deprecated)
      ) {
        return null;
      }
      return {
        name,
        status: "not-deprecated",
        version: packument["dist-tags"].latest,
      };
    })
  );
  return [...released, ...removed].filter((finding) => finding !== null);
}
