# ADR 0015: Secure Publishing Posture

## Status

Accepted

## Context

Glion publishes ~40 packages under the `@glion/*` scope on npm via Changesets (see `.github/workflows/release.yml`). A successful supply-chain attack on any one of them — accidental misconfiguration, stolen publisher credentials, tampered build artifact, or hijacked devDependency — would ripple into every downstream healthcare integration that consumes Glion. HL7v2 processing sits on the hot path for protected health information: the threat model is not hypothetical.

Historical npm incidents (`event-stream`, `ua-parser-js`, `node-ipc`, `colors.js`) show that the attack surface around `npm publish` is wider than the code itself. An npm package is trusted by consumers if — and only if — the following are all true:

1. The package **shape** is what the maintainers intended (correct `exports`, `files`, types, bin, no leaked `src/` or secrets).
2. The **publisher** is authenticated and authorized. A token exfiltrated from a laptop should not be able to publish.
3. The **build inputs** (devDependencies, transitive deps, build tools) are pinned and reviewable. A minor-version bump to a linter should not silently rewrite artifacts.
4. The **publish trigger** is reproducible and auditable. A published version should always correspond to a commit on `main` that passed CI.
5. **Provenance** — consumers can cryptographically verify that a given tarball was built by the project's CI pipeline, not by an unknown machine.

No single tool covers all five. This ADR defines Glion's layered posture. Each mechanism addresses one or more of these surfaces; gaps are called out explicitly so that future work has a known target.

## Decision

Glion enforces the following layered secure-publishing posture. Every mechanism that can be automated runs in CI on every PR; mechanisms that require org-level configuration are captured as non-code contracts maintainers MUST uphold.

### 1. Package-shape validation with `publint` — addresses (1)

All public packages MUST pass `publint --strict` on every pull request. Implementation follows the same monorepo conventions as `build`, `test`, and `check-types` — it is a first-class turbo task, not a bespoke script:

- **Per-package script**: every public package declares `"publint": "publint --strict"` in its own `package.json`. Private packages do not declare it and are therefore skipped by turbo.
- **Turbo task**: `turbo.json` defines `publint` with `dependsOn: ["build"]` and empty `outputs`. This gives parallel execution across cores, per-package caching keyed on package inputs + build outputs, and identical UX to every other monorepo task.
- **Root delegate**: `pnpm publint` → `turbo run publint`. No custom runner.
- **CI job**: `packaging` in `.github/workflows/ci.yml` runs `pnpm publint`. Turbo's caching means re-runs on unchanged packages complete in seconds.
- **Version pin**: publint is pinned to an exact version in each package's `devDependencies`, never a SemVer range. A bump is a single PR that touches all packages at once.

**What `publint` catches:**

- Malformed `exports` maps, including missing `types` conditions under `node16`/`nodenext` module resolution.
- `types`, `main`, `bin` paths that point to files not in the published tarball.
- `files` arrays that omit needed artifacts — or, inversely, package directories shipping `src/`, `tests/`, `tsconfig.tsbuildinfo`, `.turbo/` logs, or other non-runtime content. This was a live issue caught when wiring the check: `@glion/annotate-delimiters` was missing its `files` field and publishing source, tests, and build config to npm.
- CJS/ESM interop inconsistencies, `type: "module"` mismatches, and missing `engines` / `license` metadata.

**What `publint` does NOT catch — complementary mechanisms still required:**

- **Types-resolution correctness under all module systems.** `publint` checks structural shape; `@arethetypeswrong/cli` checks whether the declared types actually resolve under `commonjs`, `node16`, `bundler`, etc. Deferred to a follow-up; not a blocker for launch since all Glion packages are ESM-only with a single conditional exports shape.
- **Runtime behavior.** publint does not execute code. Test suites (`pnpm test`) and e2e tests (`e2e-bun` job) cover that.
- **Malicious code in dependencies.** See section 3.

### 2. Publisher authentication & provenance — addresses (2) and (5)

**Target state:**

- Every published tarball carries a sigstore provenance attestation, minted from the `id-token: write` GitHub Actions permission declared on the publish job in `release.yml`.
- npm scope `@glion` uses **trusted publishing** (npm's OIDC-based alternative to long-lived tokens), so no `NPM_TOKEN` secret is required in the workflow.
- All human publishers on the scope have 2FA enforced for both login and write operations.

**Status (2026-09-13):** the `@glion` scope publishes through npm trusted publishing (OIDC) from `.github/workflows/release.yml`; there is no `NPM_TOKEN` secret. npm derives provenance from the OIDC exchange, so no `--provenance` flag is passed. The publish job is the only job that holds `id-token: write`; it publishes tarballs packed by a separate job that holds `contents: read` only. Trusted publishers are configured per package on npmjs.com, and a package that does not exist yet cannot be created through OIDC: a new package needs one token-based publish from a maintainer before the workflow can release it. That first publish is the one sanctioned exception to section 4.

### 3. Supply-chain integrity — addresses (3)

- **Internal deps** use `workspace:*` and resolve to exact versions at publish time via Changesets.
- **Third-party devDependencies that materially shape published artifacts** (build tools, type generators, linters that run in CI, `publint` itself) MUST be pinned to exact versions — no `^` or `~`. See `package.json` root and per-package: `tsdown`, `typescript`, `vitest`, `oxlint`, `oxfmt`, `ultracite`, `publint`, `turbo` are all exact-pinned.
- **Runtime dependencies of published packages** MAY use caret ranges where upstream follows SemVer reliably (`unified`, `lru-cache`, `zod`). The blast radius is bounded because Glion packages are themselves pinned by downstreams.
- **Dependency bumps** are reviewed PRs, not automated merges. Dependabot / Renovate is opt-in per-dep.
- **`pnpm` lockfile** (`pnpm-lock.yaml`) is committed. CI installs with `--no-frozen-lockfile` only under the explicit `ci:install` alias; any production or release path must enforce frozen lockfiles.

### 4. Publish trigger integrity — addresses (4)

- Publishes happen **only** from the `Changesets` workflow in `.github/workflows/release.yml`, triggered by merges to `main`.
- The pack job runs `pnpm build` and packs every publishable package into a tarball; the publish job publishes those tarballs and nothing else, so artifacts are built from the exact source on `main`.
- Developers MUST NOT run `npm publish` or `pnpm publish` from local machines. No exceptions: even hotfix releases go through a PR → merge → release workflow.
- `pnpm check:release` (`tools/check-release`) verifies weekly that each public package's workspace version is on the registry with a provenance attestation, so a failed or forgotten publish cannot go unnoticed between releases. A version that reached npm without provenance was not published by this workflow.
- Publishing is delegated to `changeset publish`, which publishes each package's packed tarball in dependency order, skips versions already on the registry, and reports per package instead of aborting the whole run on the first failure. It passes `--no-git-checks` to pnpm because CI operates on a detached HEAD; that flag does not weaken any other guarantee.

### 5. Minimal package contents — addresses (1) defence-in-depth

Every public package MUST declare `"files": ["dist"]` (or equivalent narrow allowlist). This is defence-in-depth against accidentally shipping:

- Source TypeScript that leaks implementation detail and disagrees with the shipped `.d.ts`.
- `.env*` files, `.turbo/` build logs, or any file with CI-emitted data.
- Test fixtures that may contain synthetic-but-realistic PHI patterns.

`publint` enforces this because it packs via `pnpm pack` and inspects the resulting tarball.

### 6. Secrets & credential hygiene — cross-cutting

- `SECURITY.md` does not yet exist in the repo. A follow-up will add it with a `security@rethinkhealth.io` reporting address and a disclosure policy. CONTRIBUTING.md already references that email (`CONTRIBUTING.md:74`).
- No `NPM_TOKEN` should be checked into repo history or stored outside GitHub Actions encrypted secrets. Migration to trusted publishing (section 2) removes the need for this secret entirely.
- GitHub Actions `permissions:` are set per-job to the minimum required. The release workflow already declares `id-token: write` / `contents: write` / `packages: write` — appropriate for provenance and changesets PR creation, and no broader.

## Consequences

### Positive

1. **Mechanical floor for package hygiene.** Contributors cannot merge a PR that ships `src/` or breaks types resolution. The check catches malformed `exports` before a release yank-and-republish cycle.
2. **Layered defence.** No single compromise (stolen token, linter bump, maintainer mistake) breaks the chain; each layer narrows what an attacker can do.
3. **Publicly-verifiable releases (when section 2 lands).** Downstream healthcare integrators can verify via sigstore that a given `@glion/*` tarball came from this repo's CI.
4. **Explicit gap surface.** Unimplemented mechanisms (provenance, trusted publishing, ATTW) are called out by name so they are not forgotten.

### Negative

1. **PRs now block on packaging issues.** A contributor who adds a package without a `files` field or with a malformed `exports` map will fail CI until they fix it. This is the intended trade-off: catch at PR time, not at release time.
2. **Extra CI job.** The `packaging` job runs a full build (~40s) before publint. Parallelizable with testing/linting; in practice adds under a minute to overall CI wall-clock on uncached runs.
3. **Version-pinning discipline.** Exact pins mean contributors must bump tools explicitly, rather than inheriting minor bumps. This is friction by design.

### Neutral

1. **publint's `--strict` may flag additions as the tool evolves.** Because publint itself is pinned exactly, the rule set cannot change out from under a PR. Bumping publint will be a dedicated PR that can surface and address any new rule.
2. **ATTW deferred.** Section 1's callout is explicit; if ATTW later reveals issues publint missed, section 1 will be amended and ATTW wired in under the same `packaging` job.

## Alternatives Considered

- **Wire publint into the existing `linting` job.** Rejected. The `linting` job does not run `pnpm build`, and publint requires built `dist/` output to inspect. Adding a build step to `linting` would either duplicate work or couple concerns that deserve separate jobs.
- **Per-package `prepublishOnly` hook running publint.** Considered as belt-and-suspenders. Rejected for now: CI is the authoritative gate, and developers do not publish from local machines (section 4). Adding it would duplicate enforcement without closing a real hole. Revisit if the publish path ever changes.
- **Bespoke `tools/publint-workspace.mjs` runner.** Considered and rejected. Every other workspace check (`build`, `test`, `check-types`) is a turbo task; introducing a hand-rolled script for publint would be inconsistent, lose caching, require separate maintenance, and drift from the monorepo convention. The turbo task form above achieves the same goals with none of these costs.
- **Manual review of each release.** Does not scale to ~40 packages and does not catch the classes of bug publint catches (resolution under `node16`, tarball contents).
- **Run publint non-strict and ratchet later.** Rejected. One real issue was found during inventory (`@glion/annotate-delimiters` missing `files`), all other packages already pass strict. Landing at strict immediately avoids a second normalization pass.
- **Custom in-house packaging lint.** publint is maintained by an ecosystem maintainer active in Vite/Rolldown (aligned with Glion's tsdown choice), widely adopted, and exact-pinned on our side. Building our own would be strictly worse.

## References

- `turbo.json` — `publint` task definition
- `.github/workflows/ci.yml` — `packaging` job
- `.github/workflows/release.yml` — publish pipeline (provenance gap noted in section 2)
- `CONTRIBUTING.md` — points to the `Packaging checks` workflow
- [publint](https://github.com/bluwy/publint) — upstream tool
- [npm provenance (sigstore)](https://docs.npmjs.com/generating-provenance-statements) — for section 2 follow-up
- [Are The Types Wrong?](https://arethetypeswrong.github.io/) — complementary tool deferred per section 1

## History

- 2026-04-21: Accepted. Section 1 (publint) landed in PR for issue #591. Sections 2–6 describe the target posture; gaps are explicit.
- 2026-05-08: Section 2 landed. pnpm 10 and OIDC trusted publishing replaced `NPM_TOKEN` (#635).
- 2026-09-13: Release workflow split into select-mode, version, pack, and publish jobs on Changesets CLI v3 and `changesets/action@v2`, with `id-token: write` confined to the publish job.
- 2026-09-13: Release canary added. Nothing had reached npm between 2026-05-08 and 2026-09-13 because publish-mode runs failed only when no changesets were pending; the canary makes that state fail on its own schedule.
