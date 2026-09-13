# ADR 0016: Continuous Preview Releases with pkg.pr.new

## Status

Accepted

## Context

Glion ships ~40 packages under the `@glion/*` scope via Changesets on merges to `main` (see ADR 0015 and `.github/workflows/release.yml`). This release cadence is the right default for consumers who want stable versions, but it creates a feedback gap for the people who need a build _before_ it reaches npm:

- **Bug reporters.** A downstream integrator files an issue, a maintainer opens a fix PR, and the reporter now has to choose between (a) installing from a git URL, which does not trigger our build pipeline and ships raw TypeScript, (b) cloning the repo locally and `pnpm link`-ing, or (c) waiting for the next Changesets release. All three paths are high-friction, and (c) can be days away if the fix lands behind other unreleased changes.
- **Cross-team reviewers.** When a PR changes AST shape, lint behavior, or plugin ordering, the most useful review signal is "did this break my integration?" — a question only answerable by running the candidate code against a real consumer project. Without preview packages, reviewers are limited to reading the diff and reasoning about impact.
- **Internal consumers.** Other teams at rethinkhealth that depend on `@glion/*` cannot validate an unreleased fix before we publish it. Any bug we ship is already in their lockfiles before they know.

The effect is that releases carry more risk than they should. We discover integration issues after npm publish instead of before, and the feedback loop from "fix proposed" to "fix verified" is measured in release cycles rather than commits.

### Why not expand the existing release pipeline

Four approaches were considered as alternatives to a separate preview system:

1. **Pre-release tags on npm** (e.g. `@glion/parser@0.5.0-next.abc1234`). Works, but pollutes the real npm registry with one version per commit, requires managing dist-tags, and consumers end up installing artifacts that look like real releases. Also couples preview integrity to our npm scope's trust posture from ADR 0015 — a compromise of the preview path becomes a compromise of the release path.
2. **Publish to a private npm registry.** Adds infrastructure (registry hosting, auth, lifecycle) for a use case that is inherently public-facing (external bug reporters need to install without a token).
3. **Git-URL installs.** Already possible today. Does not build the package, so consumers get source TypeScript without the `exports` map, types, or bundled output. Fails the moment a consumer uses the package as its `exports` map declares.
4. **`pnpm link` or workspace checkout.** Requires the consumer to clone Glion and maintain a local build. Not a viable workflow for external reporters.

None of these solve the "install by commit SHA, verify, throw away" workflow that bug triage and PR review actually need.

### Why pkg.pr.new

[pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new) (from the StackBlitz team) publishes package tarballs to a separate registry keyed by commit SHA, with a URL format like `https://pkg.pr.new/@glion/parser@{sha}` that `pnpm add` accepts directly. It is purpose-built for this workflow. Specifically:

- **Separate registry.** Preview artifacts never touch npm. The real release path in ADR 0015 is unaffected; there is no shared credential, no dist-tag entanglement, no risk of a preview being mistaken for a release.
- **Commit-addressed, not version-addressed.** Consumers install `https://pkg.pr.new/@glion/parser@{sha}` — no version-bump negotiation, no dist-tag juggling. The SHA is the identity.
- **Automatic PR comments.** On every PR, a comment appears with ready-to-paste install commands for each package that changed. This is the feature that makes the workflow usable: reviewers do not have to construct URLs by hand.
- **Zero npm credentials.** Publishes are authorized via a GitHub App installation, not an `NPM_TOKEN`. There is no new secret to rotate, and a token exfiltration cannot cross over from previews into the real release path.
- **No lifecycle management.** Preview packages expire on the pkg.pr.new side. We do not accumulate a graveyard of per-commit versions that we have to clean up.

The trade-off is an external dependency (pkg.pr.new's service and the GitHub App) that is not under our control. This is acceptable because the preview channel is not on the critical path for anything: if pkg.pr.new is down, bug triage falls back to the pre-existing (slow) workflows. Releases continue to flow through ADR 0015's pipeline unaffected.

## Decision

Glion will publish preview packages on every PR and every push to `main` via pkg.pr.new, configured as a new standalone GitHub Actions workflow that is independent of both CI and the Changesets release pipeline.

### 1. Workflow file: `.github/workflows/preview.yml`

A new workflow, not an addition to `ci.yml` or `release.yml`:

- **Separate from `ci.yml`** because preview publishing and CI signal have different semantics. A failed preview publish should not turn CI red; a failing test should not block a preview from reaching a bug reporter (it is still installable; the failure is visible via the CI status on the same PR).
- **Separate from `release.yml`** because previews are explicitly _not_ releases. Mixing them increases the chance that a future change to one path accidentally affects the other, and obscures the boundary that ADR 0015 depends on.
- **Single job**, single matrix leg (Node 22 on `ubuntu-latest`). Previews do not need a Node-version matrix — the published tarball is the same regardless of publisher Node version, and the e2e/matrix coverage already lives in `ci.yml`.

### 2. Triggers

- `pull_request` on `opened`, `synchronize`, `reopened` — republishes preview on each push to a PR branch.
- `push` on `main` — gives every mainline commit a retrievable preview URL.
- **Forks are not supported in v1.** Using `pull_request` (safe) rather than `pull_request_target` (runs trusted workflow against untrusted PR code) means PRs from forks do not receive a preview comment. Glion's contributor base today is small and primarily organizational; revisit when external contributions become routine.

### 3. Published package scope

`./packages/*` — all public workspace packages. pkg.pr.new auto-skips packages marked `"private": true`, and `tools/*` is outside the glob entirely. This makes the preview set identical to the release set, so "what pkg.pr.new publishes" and "what Changesets publishes" stay in sync by construction.

### 4. Workflow steps

```yaml
steps:
  - uses: actions/checkout@v5
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4
    with:
      node-version: 22.x
      cache: "pnpm"
  - run: pnpm ci:install
  - run: pnpm build
  - run: pnpm exec pkg-pr-new publish './packages/*' --compact --pnpm
```

No test or lint gate. CI already reports test/lint/publint status on the same PR next to the preview comment; duplicating those gates here would waste CI minutes and couple the preview path to signals it does not need.

`pkg-pr-new` is pinned as an exact-version root devDependency, consistent with ADR 0015 section 3 — any tool that publishes artifacts on our behalf must be reproducible across runs and upgradeable via a reviewed PR rather than silently resolved by `npx` at runtime. The workflow invokes it via `pnpm exec` so every run uses the version in `pnpm-lock.yaml`.

Flag rationale:

- `--compact` — uses the short URL form `https://pkg.pr.new/@glion/parser@{sha}` instead of the long `https://pkg.pr.new/rethinkhealth/glion/...`. Requires the GitHub App to be installed on the repo (enforced by pkg.pr.new).
- `--pnpm` — packs tarballs via `pnpm publish` semantics, matching the real release tooling from ADR 0015 so preview and release artifacts have the same shape.

### 5. Workflow permissions

- `contents: read` — checkout.
- `pull-requests: write` — required for the pkg.pr.new bot to post install-command comments on PRs.
- **No** `id-token: write` — pkg.pr.new uses the GitHub App installation, not OIDC-to-npm. The release workflow's OIDC privileges are not extended to this workflow.

### 6. Manual prerequisite

The pkg.pr.new GitHub App must be installed on `rethinkhealth/glion` before the workflow will succeed. This is a one-time repo-admin action and cannot be scripted. The README and CONTRIBUTING docs will point to the preview URL pattern once the App is installed.

### 7. Explicitly out of scope for v1

- **StackBlitz playground templates.** The upstream issue (#540) marks this "optional" and no concrete consumer has asked. Adding later is a purely additive change and does not require revisiting this ADR.
- **Preview publishing on forked PRs.** Covered above; not worth the `pull_request_target` security complexity today.
- **Test/lint gating.** See section 4.

## Consequences

### Positive

1. **Faster bug-fix feedback loops.** "Fix proposed → fix verified in consumer's environment" drops from release-cycle-length to single-commit-length. Bug reporters can install the fix the moment a PR is updated.
2. **Better PR review signal.** Reviewers can install the candidate package into their own integration and run it against real data before approving, instead of reasoning about diff impact abstractly.
3. **Release quality rises.** Because previews catch integration issues before merge, the npm releases produced by the Changesets pipeline are more likely to be known-good.
4. **No blast radius into the release path.** Previews use a separate registry, separate credentials (GitHub App), and a separate workflow file. A failure or compromise in the preview path cannot propagate into npm publishing.
5. **Preview set equals release set by construction.** Using the same `./packages/*` glob that Changesets publishes means we cannot accidentally preview something that will not release, or vice versa.

### Negative

1. **External service dependency.** pkg.pr.new is a third-party service run by the StackBlitz team. If it goes down, the preview workflow fails. This is acceptable because no release path depends on pkg.pr.new and the pre-existing bug-triage fallbacks (git URL, clone + link) still work.
2. **Additional GitHub Actions minutes.** Every PR push and every merge to `main` now runs a build-and-publish cycle. Roughly one extra `pnpm build` per PR update. Mitigated by not running tests again (they run in `ci.yml`) and by pnpm's store cache.
3. **GitHub App install is an operational dependency.** Setting up the repo requires a repo admin to install the pkg.pr.new GitHub App. This is a one-time cost but a non-code step that a fresh clone of the repo cannot reproduce.
4. **No preview coverage for forked PRs.** External contributors cannot receive a preview link on their own PRs. Workaround is for a maintainer to push the branch to an internal fork; long-term fix is revisiting `pull_request_target`.

### Neutral

1. **Preview URLs are public.** Anyone who sees the commit SHA can install the preview. This is the whole point and is consistent with Glion being an open-source project, but it means secrets must never be committed (already enforced by ADR 0015 and the secret-scanning defaults on GitHub).
2. **Preview packages do not carry provenance.** pkg.pr.new does not produce sigstore attestations. ADR 0015 section 2 targets provenance for npm releases only; previews are explicitly out of scope. A consumer who cares about provenance uses the npm release, not a preview.

## Alternatives Considered

- **npm pre-release tags (`-next.sha`, `-pr.123`).** Rejected. Pollutes the real registry with one version per commit, couples preview trust posture to release trust posture (ADR 0015), and requires dist-tag lifecycle management. Previews and releases should not share a blast radius.
- **Private npm registry (Verdaccio, GitHub Packages).** Rejected. Adds infrastructure for a use case that must be externally reachable — bug reporters cannot authenticate to an internal registry.
- **Git-URL installs (status quo).** Does not build the package; ships raw TypeScript without the `exports` map or types; fails for any consumer that imports via the `exports` entry points. Fine for "clone and hack" but not for "install and verify."
- **`pull_request_target` for fork support.** Considered and rejected for v1. The security model requires us to carefully avoid running PR-controlled scripts, and the contributor base today does not justify the complexity. Revisit if external PRs become routine.
- **Gate preview publishing on full CI passing.** Rejected. CI status is already visible on the PR; duplicating the gate here wastes minutes and makes the preview path fail for reasons unrelated to the package itself (e.g. a flaky e2e test). Consumers who care can check the PR's CI badge before installing.
- **Append a preview step to `ci.yml`'s testing job.** Rejected. The testing job runs across a Node version matrix; the preview would be published three times per run. Carving out a separate job in `ci.yml` to avoid this is functionally identical to a separate workflow file but conflates concerns.
- **Build a bespoke preview publisher.** Rejected. pkg.pr.new is a focused, maintained tool in the StackBlitz ecosystem (aligned with our tsdown/Rolldown choice). Building our own would require operating a registry, a PR-comment bot, and a retention policy — all for zero differentiation.

## References

- Upstream issue: [#540 — feat(ci): add continuous preview releases with pkg.pr.new](https://github.com/rethinkhealth/glion/issues/540)
- [pkg.pr.new](https://github.com/stackblitz-labs/pkg.pr.new) — upstream tool
- ADR 0015 — `docs/adr/0015-secure-publishing.md` — release-path trust posture, which this ADR is explicitly decoupled from
- `.github/workflows/release.yml` — Changesets release pipeline (unchanged by this ADR)
- `.github/workflows/ci.yml` — test/lint/publint/e2e pipeline (unchanged by this ADR)

## History

- 2026-04-21: Proposed.
- 2026-04-21: Pinned `pkg-pr-new` as an exact-version root devDependency and switched the workflow from `npx` to `pnpm exec` so the CLI version is reproducible across runs and governed by the same supply-chain hygiene as other build-shaping tools (ADR 0015 §3).
