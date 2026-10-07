/**
 * @module @glion/release-notes/notes
 * @file Builds one release's notes from the Changesets changelogs of every
 *   public package.
 */

const VERSION_HEADING = /^## (\S+)\s*$/;
const BUMP_HEADING = /^### (Major|Minor|Patch) Changes\s*$/;
const ENTRY_START = /^- /;
const DEPENDENCY_ENTRY = /^- (Updated dependencies|@glion\/\S+@\S+\s*$)/;

/** @type {readonly Bump[]} */
const BUMPS = ["Major", "Minor", "Patch"];

/**
 * A Changesets bump type, as its changelog heading spells it.
 *
 * @typedef {"Major" | "Minor" | "Patch"} Bump
 */

/**
 * One public package and the contents of its `CHANGELOG.md`.
 *
 * @typedef {object} PackageChangelog
 * @property {string} name The package name.
 * @property {string} changelog The changelog text.
 */

/**
 * The entries under `## <version>` in `changelog`, by bump type, or
 * `undefined` when the changelog has no section for `version`.
 *
 * Dependency-only entries are dropped.
 *
 * @param {string} changelog The changelog text.
 * @param {string} version The version whose section is read.
 * @returns {{ bump: Bump; text: string }[] | undefined} The entries, in
 *   changelog order.
 */
function sectionEntries(changelog, version) {
  /** @type {{ bump: Bump; text: string }[]} */
  const entries = [];
  let found = false;
  let inSection = false;
  /** @type {Bump | undefined} */
  let bump;
  /** @type {string[] | undefined} */
  let lines;

  const flush = () => {
    if (bump !== undefined && lines !== undefined) {
      const text = lines.join("\n").trimEnd();
      if (!DEPENDENCY_ENTRY.test(text)) {
        entries.push({ bump, text });
      }
    }
    lines = undefined;
  };

  for (const line of changelog.split("\n")) {
    const versionHeading = VERSION_HEADING.exec(line);
    if (versionHeading !== null) {
      flush();
      if (inSection) {
        break;
      }
      inSection = versionHeading[1] === version;
      found ||= inSection;
      continue;
    }
    if (!inSection) {
      continue;
    }
    const bumpHeading = BUMP_HEADING.exec(line);
    if (bumpHeading !== null) {
      flush();
      bump = /** @type {Bump} */ (bumpHeading[1]);
    } else if (ENTRY_START.test(line)) {
      flush();
      lines = [line];
    } else {
      lines?.push(line);
    }
  }
  flush();
  return found ? entries : undefined;
}

/**
 * Every entry `packages` give `version`, keyed by its text, with the number of
 * packages that have a section for `version`.
 *
 * A shared entry keeps the highest bump any package gives it.
 *
 * @param {readonly PackageChangelog[]} packages The public packages.
 * @param {string} version The released version.
 * @returns {{
 *   entries: Map<string, { bump: Bump; names: string[] }>;
 *   released: number;
 * }}
 *   The entries, in first-seen order, and the released package count.
 */
function collectEntries(packages, version) {
  /** @type {Map<string, { bump: Bump; names: string[] }>} */
  const entries = new Map();
  let released = 0;
  for (const { name, changelog } of packages) {
    const section = sectionEntries(changelog, version);
    released += section === undefined ? 0 : 1;
    for (const { bump, text } of section ?? []) {
      const entry = entries.get(text) ?? { bump, names: [] };
      entry.names.push(name);
      entry.bump =
        BUMPS[Math.min(BUMPS.indexOf(bump), BUMPS.indexOf(entry.bump))];
      entries.set(text, entry);
    }
  }
  return { entries, released };
}

/**
 * The Markdown notes for `version` across `packages`.
 *
 * An entry that several packages share appears once, under the highest bump
 * any of them gives it, followed by the packages it changed, or `all packages`
 * when it changed every package released at `version`. Dependency-only
 * entries are omitted. Returns `No changes in this release.` when no package
 * has a remaining entry.
 *
 * @param {readonly PackageChangelog[]} packages The public packages.
 * @param {string} version The released version.
 * @returns {string} The release notes.
 */
export function releaseNotes(packages, version) {
  const { entries, released } = collectEntries(packages, version);
  const sections = [];
  for (const bump of BUMPS) {
    const items = [];
    for (const [text, entry] of entries) {
      if (entry.bump === bump) {
        const names =
          entry.names.length === released
            ? "all packages"
            : entry.names.map((name) => `\`${name}\``).join(", ");
        items.push(`${text}\n\n  Packages: ${names}`);
      }
    }
    if (items.length > 0) {
      sections.push(`## ${bump} Changes\n\n${items.join("\n\n")}`);
    }
  }
  return sections.length === 0
    ? "No changes in this release.\n"
    : `${sections.join("\n\n")}\n`;
}
