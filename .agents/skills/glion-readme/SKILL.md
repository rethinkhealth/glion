---
name: glion-readme
description: Use this skill whenever the user asks to write, audit, review, or improve a README for a @glion/* package, or whenever editing any packages/*/README.md in the glion repository. Produces Diataxis-compliant, reference-voiced READMEs that follow the established glion shape, and ESLint-style metadata plus Valid/Invalid examples for lint rule packages. Trigger even when the user does not say "README" explicitly — phrases like "document this lint rule", "write the docs for @glion/foo", "the package docs for X are out of date", "make a doc page for this rule", "add a status header to these lint rules", or any task that touches a packages/<name>/README.md should activate this skill.
---

# glion-readme

A skill for writing and auditing README files for packages in the glion monorepo. Each `packages/<name>/README.md` is rendered as the package's reference page on `glion.dev/docs/reference/packages/<name>`, so the README is the package's canonical reference document — not just a GitHub landing page.

This skill enforces the project's documentation framework (`docs/adr/0017-documentation-framework.md`) for that surface specifically. It handles two flavours:

- **Standard package READMEs** — for parsers, plugins, utilities, runtime, presets, data, config.
- **Lint rule READMEs** — a specialisation of the standard shape with an ESLint-inspired metadata header and `Valid` / `Invalid` example blocks.

It works in two modes: **write** (a fresh README from source + tests) and **audit** (review and improve an existing README). Most invocations will be audits.

## When to use this skill

Invoke this skill when:

- The user names a glion package and asks for its README to be written, reviewed, audited, improved, updated, or "brought into line".
- The user is editing or about to edit a `packages/*/README.md`.
- A new package is being added to the monorepo.
- The user wants ESLint-style status pills, metadata headers, or `Valid`/`Invalid` examples added to lint rule docs.
- The user describes documentation work that ultimately produces or modifies a package README, even when phrased as "docs", "rule documentation", or similar.

If the user asks for documentation work outside `packages/`, this skill does **not** apply — direct them to the framework doc and the relevant authoring guide instead.

## Read these before writing

Always read these files before producing or editing a README:

1. **`docs/adr/0017-documentation-framework.md`** — sections §6.3 (reference voice), §7 (cross-cutting conventions), and §11 (common mistakes). The skill assumes those rules; do not re-derive them.
2. **`<package>/package.json`** — name, version, `peerDependencies`, `dependencies`, `description`, `exports`.
3. **`<package>/src/index.ts`** (and any other entry source) — exports, public types, options interfaces, default values.
4. **`<package>/tests/`** or **`<package>/test/`** — behavioural ground truth. Examples in the README must match what the tests actually verify. Do not invent HL7v2 fixtures; lift them from tests where possible.
5. **One or two sibling READMEs in the same category** — for house style. The category-detection rules are in §"Detect the package category" below.
6. **`<package>/CHANGELOG.md`** — only when filling the **Since** pill on a lint rule. Use the earliest published version.

If any of these are missing, surface it to the user before guessing.

## Detect the package category

The README spine is shared across all packages, but the variant sections differ. Determine the category from the package name:

| Match on package name                                                                  | Category              | Variant guidance                                                                                        |
| -------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `@glion/lint-*`                                                                        | **Lint rule**         | Full lint rule template (see §"Lint rule template")                                                     |
| `@glion/preset-*`                                                                      | **Preset**            | List the bundled plugins; no `Valid`/`Invalid` block                                                    |
| `@glion/annotate-*`                                                                    | **Annotation plugin** | API documents the `file.data` keys it sets and the node-level annotations it adds                       |
| `@glion/decode-escapes`, `@glion/encode-escapes`                                       | **Transform plugin**  | API documents how it mutates the tree and what escapes it handles                                       |
| `@glion/util-*`                                                                        | **Utility**           | API per exported function with a one- or two-line example each                                          |
| `@glion/parser`, `@glion/hl7v2`, `@glion/builder`, `@glion/to-hl7v2`, `@glion/jsonify` | **Core / pipeline**   | API documents the unified registration form and any options                                             |
| `@glion/ast`                                                                           | **Types**             | Hierarchy section listing each node type with its shape                                                 |
| `@glion/mllp`, `@glion/cli` (`packages/glion/`), `@glion/ack`                          | **Runtime**           | Includes a "How it routes" or "How it dispatches" section, and a configuration section where applicable |
| `@glion/profiles`, `@glion/config`                                                     | **Data / config**     | Documents the schema and the loader                                                                     |

When the package falls outside these patterns, default to the **standard spine** (below) without a category-specific middle section.

## The shared spine

Every glion package README uses this skeleton, in this order. Sections marked optional are kept only when they add information.

```markdown
# @glion/<name>

<one-sentence description, present tense, no marketing voice>

## What it does

<one or two short paragraphs. This is the most contextual section in the file —
it is allowed to mention "why" briefly. Everything below this is pure reference voice.>

## Install

\`\`\`bash
npm install @glion/<name>
\`\`\`

## Use

<minimal runnable example, ideally the smallest piece that produces a visible result.
Lift fixtures from tests where possible. Imports are explicit; no "..." placeholders
unless the elision is non-load-bearing.>

## Options <!-- omit when there are no options -->

<table of options + minimal example showing non-default usage>

## API

<exported symbols, signatures, parameters, returns, throws — austere reference voice>

## <category-specific sections> <!-- e.g. "What it checks", "Path format", "Pipeline" -->

## Part of Glion

`@glion/<name>` is part of **[Glion]**, the application framework for HL7v2.
See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
```

The footer link block is verbatim across the repo. Match it exactly.

## No frontmatter on READMEs

Package READMEs are published to npm and rendered on GitHub. They do **not** contain YAML frontmatter or HTML-comment metadata blocks.

## Reference voice — the rules that bite at write-time

The framework doc has the full list. These are the ones that fail most often and that you must actively guard against:

- **Describe; do not instruct.** "Returns the first AST node addressed by the path", not "Use this when you need the first node".
- **No marketing adjectives.** Strip "powerful", "blazing-fast", "robust", "elegant", "easy to use", "simple", "amazing", "smart" wherever they appear. They evaporate trust.
- **Active voice.** "The parser produces an AST" beats "An AST is produced by the parser".
- **One example per fact, kept minimal.** If an example needs imports, scaffolding, and a `main`, it belongs in a how-to guide, not in the README. Reference examples are one to five lines.
- **Cross-references go in named sections** (`## See also`, footer, sidebar) — never in prose.
- **No editorial framing in API descriptions.** "Useful for…" / "Great when…" / "We recommend…" are out of bounds. State what the symbol does and lift recommendations to a how-to.

If the package's existing README breaks any of these, the audit must surface and fix them.

## Lint rule template

This is the specialisation that the rest of this skill builds toward. Lint rule READMEs follow this exact shape; treat the headings as fixed and the metadata table as mandatory.

````markdown
# @glion/lint-<rule-name>

> <one-sentence description, imperative or declarative — "Flag …", "Validate …", "Enforce …", "Warn when …">

|                      |                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------- |
| **Recommended**      | <pill: "✅ part of `@glion/preset-lint-recommended`" OR "❌">                           |
| **Profile-aware**    | <pill: "✅ part of `@glion/preset-lint-profile-recommended`" OR "❌">                   |
| **Default severity** | <`warning` / `error` / `info`>                                                          |
| **Requires**         | <comma-separated peer plugins, e.g. `@glion/parser`, `@glion/annotate-profile-context`> |
| **Since**            | <`@glion/lint-<rule-name>@<earliest-published-version>`>                                |

## What it does

<one paragraph: what the rule looks for, why it matters in HL7v2, and how the
diagnostic surfaces (typically as a `file.message` warning gathered into
`vfile.messages`).>

## Install

\`\`\`bash
npm install @glion/lint-<rule-name>
\`\`\`

## Use

<minimal runnable example, ~12–25 lines. Use a real fixture from tests where
possible. Show the reporter or the diagnostic output.>

## Options <!-- omit when the rule takes no options -->

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `…`    | `…`  | `…`     | …           |

\`\`\`ts
// minimal example with non-default options
\`\`\`

## API

### `unified().use(hl7v2Lint<RuleName>[, options])`

A `unified` lint rule plugin. <One sentence on what it visits and what it reports.>

\`\`\`ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

declare const hl7v2Lint<RuleName>: Plugin<[<Options?>], Root>;
export default hl7v2Lint<RuleName>;
\`\`\`

## What it checks

<one short paragraph stating the rule precisely, in declarative form. This is the
authoritative definition of the rule's behaviour. Keep it tight — one or two
sentences is ideal.>

### Valid

<one or two HL7v2 examples that pass the rule. Each in its own ```hl7 block.>

\`\`\`hl7
MSH|^~\&|...
PID|...
\`\`\`

### Invalid

<one or two HL7v2 examples that fail the rule. For each, follow the example
with the diagnostic message verbatim (lifted from tests).>

\`\`\`hl7
MSH|^~\&|...
PID|...
\`\`\`

Reported message:

\`\`\`
<diagnostic-text>
\`\`\`

<short paragraph explaining any interpolation, pluralisation, or per-segment
behaviour the diagnostic exhibits — only when the rule has such behaviour.>

## When not to use it <!-- optional but recommended -->

<one short paragraph naming a legitimate situation in which a team would
deliberately disable this rule. If you cannot think of one, omit the section.
Do not invent reasons. Honest opt-out guidance builds trust.>

## Part of Glion

`@glion/lint-<rule-name>` is part of **[Glion]**, the application framework for HL7v2.
See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
````

### Filling the metadata pills

Each pill is derived, not invented:

- **Recommended** — read `packages/preset-lint-recommended/package.json`. If the rule's package name appears in `dependencies`, set the pill to `✅ part of \`@glion/preset-lint-recommended\``. Otherwise `❌`.
- **Profile-aware** — read `packages/preset-lint-profile-recommended/package.json` the same way. The pill phrasing is `✅ part of \`@glion/preset-lint-profile-recommended\``or`❌`.
- **Default severity** — inspect the rule's `src/`. Calls to `file.message(...)` produce warnings (severity `warning`, the typical case). Calls to `file.fail(...)` or thrown errors produce fatal errors (severity `error`). If the rule emits info-level only, use `info`. When in doubt, default to `warning` and confirm with the user.
- **Requires** — list the rule's `peerDependencies` from its `package.json`, dropping `unified` itself (assumed). Order: `@glion/parser` first when present, then any annotators in pipeline order, then anything else alphabetically.
- **Since** — read `packages/<name>/CHANGELOG.md` and use the earliest version that includes the rule's first publish. Format: `@glion/<full-package-name>@<version>`. If the changelog is missing or unclear, ask the user rather than guess.

If a pill cannot be determined from sources, write `<unknown>` and surface it to the user; never fabricate.

### Sourcing Valid/Invalid examples

The fixtures in `### Valid` and `### Invalid` blocks come from the rule's tests. Procedure:

1. Read the test files in `<package>/tests/` or `<package>/test/`.
2. Identify the test cases that demonstrate the canonical pass/fail behaviour. Skip edge-case tests for the README — they belong in tests, not in user-facing docs.
3. Lift the HL7v2 fixture verbatim. Trim any boilerplate that obscures the point of the example.
4. Lift the diagnostic message verbatim. Do not paraphrase reported messages — they are part of the rule's contract.
5. Always include `MSH` in the fixture. A bare segment without context is harder to read.

If the tests do not contain a clean example, write one that you can verify by running the rule, then surface to the user that you have introduced a synthetic fixture so it can be added to tests.

## Variant guidance for non-lint packages

For other categories the spine is identical; only the middle changes. Brief notes:

- **Preset** — after `## API`, add a `## Bundled rules` (or `## Bundled plugins`) section listing each member with a one-line summary and a link to its README. Do not duplicate the member docs.
- **Annotation plugin** — the API section documents (a) the registration form, (b) the keys added to `file.data`, (c) the node-level fields the plugin sets. A short fixture before/after pair is acceptable.
- **Transform plugin** (`decode-escapes`, `encode-escapes`) — the API section names the escape sequences handled and any options. A `## Round-tripping` section is acceptable when behaviour is not symmetric.
- **Utility (`util-*`)** — one `### <function>` heading per exported function. Each entry: signature, one-line description, parameters/returns when non-trivial, one-to-five-line example. Group related functions if the count is large.
- **Core / pipeline** — for `parser`, `hl7v2`, etc., add a `## Pipeline` (or `## Stages`) section that names each stage and the package it comes from when the package composes other packages. `@glion/hl7v2` is the canonical model.
- **Types (`@glion/ast`)** — after `## API`, add a `## Node hierarchy` section listing each node type with its TypeScript shape. No tutorials, no how-to.
- **Runtime (`@glion/mllp`, `@glion/cli`, etc.)** — after `## API`, add `## Configuration`, `## Routing` (where applicable), and `## Lifecycle` or `## Logging` when the package owns process-level behaviour. Keep examples runnable.
- **Data / config** — document the schema in a table. The `## Use` block shows the loader call.

When in doubt, follow the closest sibling that already exists.

## Audit mode (existing README)

When the README already exists, do not rewrite it from scratch unless the user asks. Procedure:

1. Read the existing README and classify each section into the spine.
2. Build a deltas list, in this order of priority:
   1. **Voice violations** — instructive prose in API blocks, marketing adjectives, editorial recommendations. Fix in place.
   2. **Missing required sections** — `What it does`, `Install`, `Use`, `API`, `Part of Glion` for all packages; for lint rules also the metadata table, `What it checks`, `Valid`, `Invalid`. Add them.
   3. **Drifted examples** — examples that do not match the current API or current test fixtures. Update from source.
   4. **Out-of-spine sections** — content that does not fit any spine slot. Either fold into an existing slot or surface to the user for decision; do not delete silently.
   5. **Stale metadata pills** (lint rules) — pills that no longer reflect the preset membership or peer deps. Re-derive.
3. Apply the changes that are safe (voice, drifted examples, missing pills). Surface changes that involve subjective decisions (deleting whole sections, moving tutorial-shaped content into a how-to) to the user before applying.
4. Produce a short summary at the end naming what changed and why.

In audit mode, preserve the package author's voice and structure unless they violate the framework. The point of audit is alignment, not rewriting.

## Self-check before reporting done

Run through this list. Every item is checkable from the produced README alone.

- [ ] H1 is `# @glion/<name>` with no extra adornment.
- [ ] One-line description is present, present tense, free of marketing voice.
- [ ] `## What it does`, `## Install`, `## Use`, `## API`, `## Part of Glion` all present.
- [ ] `## Install` block uses `npm install @glion/<name>` exactly.
- [ ] `## Part of Glion` footer matches the canonical block character-for-character (including link refs).
- [ ] Code examples are syntactically valid and import every symbol they use.
- [ ] No marketing adjectives anywhere (run a mental grep for: powerful, blazing, robust, easy, elegant, simple to use, amazing, smart, intuitive).
- [ ] No instructive language in `## API` ("Use this when…", "It is recommended to…", "Great for…").
- [ ] If lint rule: metadata table is the second element after the description, has all five rows, every cell is filled (no `<unknown>` left in).
- [ ] If lint rule: `### Valid` and `### Invalid` both present; reported message is verbatim from tests.
- [ ] If lint rule: imports in `## Use` show `vfile-reporter` only when the example calls it.
- [ ] Spelling matches the existing repo convention (American spelling is current house style for prose; do not impose British across the repo).
- [ ] All internal links resolve (`../<sibling>/`).

If any item fails, fix it before reporting done.

## Working with the user

- When given a package name without a path, infer the path as `packages/<name-without-scope>/`.
- When uncertain about a metadata pill or a fixture, ask rather than fabricate. The skill's value is correctness; a guess that ships becomes a long-lived defect.
- When audit mode would touch more than ~30 % of the file, ask the user whether they prefer audit (in-place fixes) or rewrite (fresh README from source). Both are valid; the user picks.
- After writing or editing, summarise the changes in 3–6 bullets so the user can review without diffing.

## Reference material in this skill

- `references/voice-and-checks.md` — the full voice rule list and an extended anti-pattern catalogue. Read when the user pushes back on a voice change or when auditing a README that has heavy editorial drift.
- `references/lint-rule-anatomy.md` — deeper dive on lint-rule mechanics: how to recognise a rule's report shape from `src/`, how to source examples from tests, how to identify the canonical Valid/Invalid pair when tests are noisy.
