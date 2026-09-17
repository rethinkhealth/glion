# Glion Documentation Framework

## Status

Accepted

This is the canonical reference for how we write documentation across `glion.dev`. Anyone (human or agent) authoring or editing a documentation page should read this once before starting and consult the relevant section while writing.

It exists because the most expensive documentation mistakes are structural — putting content in the wrong section, blending two user needs into one page, drifting from voice — and these mistakes compound. Catching them at write-time is cheap; catching them after the IA has solidified is not.

The document is opinionated by design. When this framework conflicts with personal taste or with patterns from other projects, follow the framework.

---

## 1 · The two products we document

`glion.dev` documents two distinct products:

1. **HL7v2 — the standard.** Tool-agnostic. Useful even if glion did not exist.
2. **Glion — the tool.** A specific implementation of an HL7v2 application framework.

These have overlapping audiences but different lifespans, different sources of truth, and different correctness criteria. **Never blend them in a single page.** A page is about one or the other; cross-link between them generously.

Profile reference data (events, segments, fields, datatypes, tables, per HL7v2 version) is a third surface that belongs to the standard but is hosted by glion because glion is the tooling that exposes it.

## 2 · The Diataxis foundation

We use the [Diataxis framework](https://diataxis.fr). Every documentation page serves exactly one of four user needs, determined by two axes:

|                         | **Acquisition** (study) | **Application** (work) |
| ----------------------- | ----------------------- | ---------------------- |
| **Action** (doing)      | **Tutorial**            | **How-to guide**       |
| **Cognition** (knowing) | **Explanation**         | **Reference**          |

These are not arbitrary buckets; they are the complete territory. There cannot be three or five quadrants. Every documentation page is one of these four. If a page tries to be two of them, split it.

When the type is unclear, apply the **Diataxis compass**:

1. Does the content inform **action** (steps to take) or **cognition** (knowledge to absorb)?
2. Does the user need it for **acquisition** (learning) or **application** (working)?

The two answers pin the type. Use it before writing every page.

## 3 · Top-level information architecture

```
glion.dev
├── /                  Landing page
├── /learn/            HL7v2 the standard — learning the domain
│   ├── /learn/start/        Tutorials about the standard
│   ├── /learn/guides/       How-to guides about the standard (sparse)
│   └── /learn/concepts/     Explanations of the standard
│
├── /references/       HL7v2 reference — looking up facts
│   ├── /references/spec/           Version-stable: delimiters, escapes, ACK codes,
│   │                               encoding characters, canonical-path syntax
│   └── /references/<version>/      Per-version profile data
│       ├── events
│       ├── segments
│       ├── fields
│       ├── datatypes
│       └── tables
│
├── /docs/             Glion the tool — using glion
│   ├── /docs/start/       Tutorials for using glion
│   ├── /docs/guides/      How-to guides for using glion
│   ├── /docs/reference/   Glion API, CLI, package, diagnostics reference
│   └── /docs/concepts/    Explanations of glion's design
│
├── /blog/             Release notes, changesets digest
└── /community/        Contributing, code of conduct, governance
```

Three doors at the top: `/learn`, `/references`, `/docs`. They map to three user intents:

- "I'm new to HL7v2" → `/learn`
- "I need a fact about HL7v2" → `/references`
- "I'm building with glion" → `/docs`

Each top-level section has its own internal Diataxis logic.

## 4 · Boundary rules

**The single rule that protects the IA:**

> `/docs` explains glion. `/learn` explains HL7v2. `/references` states facts. No page is about more than one of those things.

Three concrete consequences:

1. **`/docs` pages must not re-teach HL7v2.** When background is needed, link to `/learn`. A glion page that explains what a profile is in three paragraphs is broken; replace those paragraphs with a one-sentence callout linking to `/learn/concepts/profiles`.
2. **`/learn` pages must not promote glion.** Glion appears at most as a sidebar callout ("Build this with glion →"), never in prose. Otherwise `/learn` becomes an advert and its educational credibility erodes.
3. **`/references` pages contain only facts.** No "use this when…", no "glion validates this with…". Cross-links live in the sidebar, not the body.

The single canonical-path syntax (`MSH-9.3`, `ORDER-ORC-1`) is the **sole exception** to rule (3): it is glion-specific but lives in `/references/spec/canonical-path-syntax` because the people reaching for it are looking up paths next to segments and fields.

## 5 · Audiences

Every page is written for one of these. Naming them up front sharpens voice and example choice.

| Persona                   | Comes from                                             | Primary need                                         |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| **Integration engineer**  | Hospital IT, integration vendors, EHR teams            | Receive/send HL7v2 over MLLP, route by trigger event |
| **Healthcare developer**  | Apps that consume HL7v2 (analytics, FHIR mapping, ETL) | Parse, query, validate, transform messages           |
| **Plugin / rule author**  | Extending the ecosystem                                | Build a `unified` plugin against the AST             |
| **Domain learner**        | New to HL7v2, possibly new to healthcare               | Understand the standard before using any tool        |
| **Evaluator / architect** | Deciding whether glion fits                            | Compare design, assess maturity, find trade-offs     |

A page that cannot name its persona is a page that has not decided what it is for. Put the persona in a comment at the top of the source markdown if it helps:

```markdown
<!-- audience: healthcare developer -->
<!-- type: how-to -->
```

These comments are non-rendering and useful at review time.

## 6 · Per-quadrant authoring guide

Each quadrant has its own discipline. Treat these as binding.

### 6.1 Tutorials — `/learn/start/`, `/docs/start/`

A tutorial is a **lesson**. The reader is acquiring skill by doing. You are responsible for their success.

**Hard rules:**

- One path. No alternatives. No "if you prefer Bun, do this instead".
- Every step must work, every time, on a clean machine.
- Show the destination upfront ("By the end of this tutorial you will have a running MLLP server that ACKs `ADT^A01` messages").
- Deliver visible results early and often. The reader should see something working within the first 90 seconds.
- Maintain a narrative of expectation: "You will see…", "Notice that…", "Now run X — you should see Y".
- Trust that learning happens through doing. Do not explain the _why_ in line; link to a `concepts/` page once and move on.
- Be perfectly repeatable. Pin versions. Avoid anything that requires the reader to make a choice.
- End with a concrete summary of what they have built and a single "Next" link.

**Voice:** "We will…", "First, do X. Now do Y.", "Notice that…", "You have built…".

**Structure (template):**

```markdown
# <Verb-led title — what the reader will build>

<One-paragraph promise: by the end you will have <thing>.
Show the final result here as a screenshot, code snippet, or output.>

## Before you start

<Prerequisites as a short list. If HL7v2 background is needed, link out
to /learn/start/ — do not teach it here.>

## Step 1 — <action>

<Imperative instruction. One concrete action. Show the expected output.>

## Step 2 — <action>

<…>

## What you built

<Recap. What does the reader now have? One short paragraph.>

## Next

- <Single link to the most natural next step.>
```

**Anti-patterns:**

- Tutorials with branching ("If you're using TypeScript, do this; if JavaScript, do this") — write two tutorials or pick one.
- Tutorials that explain the framework's philosophy in the introduction.
- Tutorials that finish with "now you can adapt this to your needs" — they should finish with a working artefact.

**How many to write:** **few**. Two or three excellent tutorials beat ten mediocre ones. A broken tutorial damages trust more than a missing one.

### 6.2 How-to guides — `/learn/guides/`, `/docs/guides/`

A how-to guide is **directions for a task**. The reader knows what they want and is competent. You are not teaching; you are unblocking.

**Hard rules:**

- Title is `How to <accomplish goal>` — phrased as the user's question, not the tool's capability. Good: "How to route by trigger event". Bad: "Using the router middleware".
- Each guide answers exactly one question. If you want to add a second goal, write a second guide.
- Assume competence. Do not re-explain basics. Link to reference and explanation.
- Address real-world complexity with conditionals: "If you need X, do Y; otherwise Z".
- **Seek flow.** Anticipate the reader's next move. Minimise context switching. Ask: what must they hold in their mind, and when can they put it down?
- Omit what they do not need. Practical usability beats completeness; that is reference's job.
- Focus on the task, not the tool's surface area. A how-to about "sending ACKs" is not the same as "the `ackMiddleware` API".

**Voice:** "This guide shows you how to…", "If you need X, do Y", "To achieve Z, do W".

**Structure (template):**

```markdown
# How to <accomplish goal>

<One-paragraph framing: who this is for, what they will achieve, and
the prerequisites in one sentence — not a full Before-You-Start block.>

## <Step or decision>

<Imperative. Shortest path to the outcome. Conditionals where the path
genuinely forks.>

## <Step or decision>

<…>

## Verifying

<How does the reader know it worked? One short check.>

## See also

- <Reference link for full API surface>
- <Explanation link for why this approach>
- <Adjacent how-to that the reader is likely to need next>
```

**Anti-patterns:**

- How-to guides that begin with "Let's first understand…" — that is explanation; move it.
- How-to guides that list every option of every flag — that is reference; link out.
- How-to guides that double as tutorials by introducing the product in the first paragraph.

### 6.3 Reference — `/references/`, `/docs/reference/`

Reference is **a description of the system**. Austere, complete, neutral. Mirrors the architecture, not the user journey.

**Hard rules:**

- Describe; do not instruct. "X is available as Y." Not "Use X when Y."
- Use standard, consistent patterns. Every package page has the same headings in the same order. Every lint rule page has the same structure. Predictability is the feature.
- Be complete. Reference is the only quadrant where omission is a defect.
- Be authoritative. Speak in declaratives. No hedging.
- Strip narrative. Reference is read by people in the middle of work, looking for a fact. A paragraph of context makes it slower.
- Provide minimal usage examples — one or two lines, not full programs. For programs, link to a how-to.
- Cross-references go in defined fields ("See also", sidebar), never in prose.

**Voice:** "X is a Y.", "Sub-commands are: A, B, C.", "Returns: Z. Throws: W.".

**Structure for glion package reference (template):**

```markdown
# @glion/<name>

<One-sentence description of what this package is.>

## Install

\`\`\`bash
npm install @glion/<name>
\`\`\`

## Exports

| Name | Type | Description |
| ---- | ---- | ----------- |

## API

### <symbol>

<Signature.>

<Parameters as a definition list. Returns as a definition list.
Throws as a definition list. Notes as a short prose paragraph if needed.>

\`\`\`ts
// Minimal usage. One or two lines.
\`\`\`

## See also

- <Related package>
- <How-to guide that uses this>
```

**Structure for HL7v2 reference (segment, field, datatype, table page):**

```markdown
# <Identifier> — <Short name>

<One-sentence description from the standard.>

## Definition

|               |     |
| ------------- | --- |
| Length        | …   |
| Datatype      | …   |
| Optionality   | …   |
| Repeatability | …   |
| Table         | …   |

## Components

<Table when composite. Each row links to the component's reference page.>

## Standard reference

<Link to the canonical HL7-published source for this version.>

## See also

<Sidebar links to related entries and to glion lint rules that touch this entry.>
```

**Anti-patterns:**

- Reference pages that explain "why" — move that to explanation.
- Reference pages with worked examples longer than two lines — move those to how-to.
- Reference pages with marketing voice ("powerful", "easy", "robust") — strip it.

### 6.4 Explanation — `/learn/concepts/`, `/docs/concepts/`

Explanation is **a discussion**. Discursive, contextual, opinion-permitting. The reader is studying to understand.

**Hard rules:**

- Take a higher and wider perspective. Discuss the subject from multiple angles.
- Answer "why". Why is the AST shaped this way? Why does HL7v2 use carriage returns? Why does glion freeze the default processor?
- Discuss trade-offs. Explanation is the only quadrant where opinion is permitted; use it well.
- Make connections. Tie the topic to its neighbours, its history, its alternatives.
- Do not instruct. The moment you say "do X", you have written how-to.
- Do not enumerate. The moment you list every option, you have written reference.

**Voice:** "The reason for X is…", "A is preferable to B, because…", "Some prefer Y. This can be effective, but…".

**Structure (template):**

```markdown
# <Topic — declarative title, not a question>

<Opening: place the topic. What is it? Why does it matter?>

## <Aspect, angle, or sub-question>

<Discussion. Connect to other concepts, history, alternatives.>

## <Aspect, angle, or sub-question>

<…>

## Trade-offs

<What does this approach buy us, and what does it cost? Be honest.>

## Further reading

<Links to authoritative external sources, ADRs, related concepts.>
```

**Anti-patterns:**

- Explanation pages that finish with "Now let's build one" — that is a tutorial; split it.
- Explanation pages that list every flag — that is reference; link out.
- Explanation pages that avoid trade-offs — every design has costs; name them.

## 7 · Cross-cutting conventions

These apply everywhere unless a section above overrides.

### 7.1 Voice and language

- **American English** spelling throughout (`behavior`, `serialize`, `center`). This matches the repo's existing prose; do not introduce British forms.
- **Second person** for tutorials ("you will…") and how-to ("if you need…"). **Neutral / no person** for reference. **Third person or first-person plural** for explanation ("the parser…", "we chose…").
- **Active voice.** "The parser produces an AST", not "An AST is produced by the parser".
- **No marketing adjectives.** Avoid "powerful", "blazing-fast", "robust", "elegant" everywhere except the landing page. They evaporate trust in technical docs.
- **Consistent terminology.** Maintain a project glossary (in `/learn/concepts/glossary` or similar). Use one term per concept; do not alternate "ack" / "acknowledgment" / "acknowledgement" within a page.

### 7.2 Code samples

- **Every example must run** as written, against a clean install of the documented version.
- Examples in `/docs/start/` and `/docs/guides/` are tested in CI from runnable sources in `examples/`. The doc page imports the snippet; it does not maintain a duplicate.
- Reference examples are minimal — one or two lines. If an example needs imports, scaffolding, and a `main`, it is not reference.
- All TypeScript samples include the import line. No `…` placeholders unless the truncated content is not load-bearing.
- Pin versions in tutorial install commands; leave them unpinned in how-to and reference.

### 7.3 Links

Three rules cover most cases.

1. **`/docs` → `/learn`** when HL7v2 background is needed. Inline link, callout style:
   > **Background:** [What an HL7v2 profile is →](/learn/concepts/profiles)
2. **`/docs` → `/references`** for "what does the standard actually say". Body link is acceptable here because the destination is a fact, not an explanation.
3. **`/learn` → glion** is sidebar-only, never in prose, with one exception: a single "Tools" appendix per concept page may name glion alongside other implementations.

Never deep-link into a tutorial from outside it. Tutorials are linear; entering at step 4 is meaningless. Link to the tutorial's start page only.

### 7.4 Naming

| What                      | Convention                                                                                            | Example                                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Tutorial files            | Verb-led, kebab-case                                                                                  | `your-first-mllp-app.md`                |
| How-to files              | `<verb>-<object>.md`, no "how-to" prefix                                                              | `route-by-trigger-event.md`             |
| Reference (glion package) | Package name                                                                                          | `mllp-ack.md`                           |
| Reference (HL7v2 entity)  | Identifier in lowercase                                                                               | `pid.md`, `cx.md`, `0001.md` for tables |
| Explanation files         | Topic-led, kebab-case                                                                                 | `the-unified-pipeline.md`               |
| Page H1                   | Tutorials/how-to: matches user goal. Reference: matches symbol. Explanation: declarative noun phrase. |

### 7.5 Per-page metadata

Every page begins with frontmatter:

```yaml
---
title: How to route by trigger event
type: how-to # tutorial | how-to | reference | explanation
audience: integration-engineer
section: docs # docs | learn | references
status: stable # draft | stable | deprecated
last_reviewed: 2026-04-25
---
```

`type` is the single most important field. It is the contract this page makes with its reader.

**Carve-out: package READMEs.** Pages rendered from `packages/*/README.md` do **not** include frontmatter in the README itself. The README is also the package's npm landing page and its GitHub frontispiece; YAML at the top would spill into both surfaces. Site-rendering metadata is therefore the docs site's responsibility, not the README's: it is derived from each package's `package.json` and the page's path, and injected at docs-build time. The README stays clean for npm and GitHub.

### 7.6 Page length

A rough guide, not a rule:

| Type                   | Typical length                                            |
| ---------------------- | --------------------------------------------------------- |
| Tutorial               | 800–2,500 words; finishes in 15–45 minutes of reader time |
| How-to                 | 200–800 words; finishes in 2–10 minutes                   |
| Reference (per symbol) | as short as possible; one screen if you can               |
| Explanation            | 600–2,500 words                                           |

If a page is much longer than these, it is probably two pages.

## 8 · Where existing material lives

| Source                                                   | Destination                                                                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `README.md`                                         | Landing page hero + `/docs/start/` index                                                                                                             |
| `packages/*/README.md`                                   | Rendered directly at `/docs/reference/packages/<name>` — single source of truth                                                                      |
| `packages/parser/ARCHITECTURE.md` and similar            | `/docs/concepts/` after rewriting for outsiders                                                                                                      |
| `examples/*`                                             | Linked from tutorials and how-tos. Not their own docs section                                                                                        |
| `docs/adr/*.md`                                          | Stays as engineering record. Public-facing distillation goes to `/docs/concepts/design-decisions/` — fewer in number, rewritten for non-contributors |
| `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `VERSIONING.md` | `/community/`                                                                                                                                        |
| `CHANGELOG.md`, changesets                               | `/blog/`                                                                                                                                             |
| `docs/brainstorms/`, `docs/plans/`, `docs/solutions/`    | Internal. Not published                                                                                                                              |
| `qa/`, `benchmarks/`                                     | Linked from explanation pages only when relevant                                                                                                     |

The package-README-as-reference rule deserves emphasis: **do not maintain reference content in two places**. If a package has facts, they live in its README and are rendered into `/docs/reference/packages/<name>`. If a fact is wrong on the docs site, the fix is to the README.

## 9 · Decision rubric — when to write what

When a contributor wants to add a doc, walk this tree.

1. **Is there an existing page that already answers this?**
   Yes → improve that page; do not create a new one.
   No → continue.
2. **Is the content about HL7v2 the standard, glion the tool, or HL7v2 facts?**
   Standard → `/learn`. Tool → `/docs`. Facts → `/references`. Continue.
3. **Apply the compass.** Action vs cognition? Acquisition vs application?
   Action + acquisition → tutorial.
   Action + application → how-to.
   Cognition + application → reference.
   Cognition + acquisition → explanation.
4. **Is the page about exactly one thing?**
   Yes → write it.
   No → split now. It does not get easier later.

## 10 · Quality checklist (per page, before merging)

Run through this before a doc PR is approved.

- [ ] Frontmatter `type` matches the page's actual content. _(MDX pages only; package READMEs have no frontmatter — see §7.5.)_
- [ ] Page serves one persona; the persona could be named in one sentence.
- [ ] Voice matches the type (see §6).
- [ ] No tutorial branching, no how-to teaching, no reference instructing, no explanation enumerating.
- [ ] Code samples run as written and are sourced from `examples/` where applicable.
- [ ] HL7v2 background, if needed, links to `/learn` rather than re-explaining.
- [ ] Glion-specific facts, if mentioned in `/learn`, live in a sidebar callout, not prose.
- [ ] Cross-links go inward (deeper detail) or outward (wider context), not sideways between similar how-tos.
- [ ] No marketing adjectives.
- [ ] American spelling.
- [ ] Title obeys §7.4 conventions.
- [ ] Page length is within the §7.6 envelope, or the deviation is justified.

## 11 · Common mistakes (with fixes)

| Mistake                                        | Fix                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Tutorial with "alternatively, you can…"        | Pick one path. Move alternatives to a how-to.                                          |
| How-to that begins by explaining the AST       | Move the explanation to `/docs/concepts/`; replace with a one-line link.               |
| Reference page that says "this is great for…"  | Strip the editorial. Reference describes; it does not recommend.                       |
| Explanation page ending with "now build one"   | Split. The first half is explanation, the second is a tutorial.                        |
| `/docs` page teaching what an HL7v2 segment is | Link to `/learn/concepts/segments`. Keep the glion page about glion.                   |
| `/learn` page listing glion's lint rules       | Move the list to `/docs/reference/`. Leave a sidebar pointer.                          |
| Two how-tos that overlap by 60 %               | Merge or refactor — duplication is silent rot.                                         |
| A how-to whose title is a feature name         | Rename to a user goal. "Using middleware" → "How to add middleware to an MLLP server". |

## 12 · Worked examples

Short demonstrations of correct voice for each type, written for glion.

### 12.1 Tutorial fragment

> ## Step 2 — Receive your first message
>
> With the server running, send a sample `ADT^A01` from the included fixture:
>
> ```bash
> npm run send-fixture
> ```
>
> Watch your dev terminal. You will see a new line:
>
> ```
> ADT^A01 received from SENDER (msg id MSG123)
> ```
>
> Notice that no acknowledgement code appears yet — we will add that in Step 3.

Voice: present-future, narrative-of-expectation, single path, visible result, no design discussion.

### 12.2 How-to fragment

> # How to send AA, AE, and AR acknowledgements
>
> Use `ackMiddleware()` to generate acknowledgements automatically. The middleware maps handler outcomes to ACK codes:
>
> - Handler returns normally → `AA` (Application Accept)
> - Handler throws `AppError` → `AE` (Application Error)
> - Handler throws `RejectError` → `AR` (Application Reject)
>
> ```ts
> import { ackMiddleware, AppError } from "@glion/mllp-ack";
>
> mllp.use(ackMiddleware()).on("ADT^A01", (msg) => {
>   if (!msg.patient) throw new AppError("Missing PID");
> });
> ```
>
> If you need to send a custom ACK shape, see [How to build a custom acknowledgement](…).

Voice: imperative, conditional ("If you need…"), one goal, links out for adjacent goals.

### 12.3 Reference fragment

> ### `ackMiddleware(options?)`
>
> Returns an MLLP middleware that generates ACK responses.
>
> **Parameters**
>
> - `options.errorMap` — `(err: Error) => AckCode`. Maps thrown errors to ACK codes. Defaults to mapping `AppError → AE`, `RejectError → AR`, anything else → `AE`.
>
> **Returns** — `Middleware`.
>
> ```ts
> mllp.use(ackMiddleware());
> ```

Voice: declarative, parameter-by-parameter, one-line example, no recommendation.

### 12.4 Explanation fragment

> ## Why glion uses `unified`
>
> HL7v2 processing is a chain of transformations: parse text, decode escapes, validate against a profile, serialise to JSON. Each stage operates on a tree.
>
> Several frameworks model this kind of pipeline. We chose `unified` for three reasons. First, its `unist` AST specification gives us a node shape that is already familiar to the wider remark / rehype ecosystem — readers who have written a remark plugin can write a glion plugin without retraining. Second, `unified` separates parsing, transformation, and compilation cleanly, which matches HL7v2's natural seams. Third, the `vfile` abstraction lets us carry diagnostics alongside the tree without inventing our own message protocol.
>
> The cost is real. `unified` was built for markdown. Some of its conventions — the `data` field, the way plugins are declared — feel awkward for a non-text format. We accept that cost because the alternative was a bespoke pipeline that nobody else would know how to extend.

Voice: discursive, names trade-offs, situates the choice in context, no instructions.

## 13 · Page templates (copy-paste starters)

For convenience. Use the ones in §6 if you prefer the minimal versions.

### 13.1 Tutorial

```markdown
---
title: <What the reader will build>
type: tutorial
audience: <persona>
section: <docs|learn>
status: draft
---

# <Verb-led title>

By the end of this tutorial you will have <thing>. <Optional: include
a screenshot or final code snippet here.>

## Before you start

- <Prerequisite>
- <Prerequisite>

## Step 1 — <action>

<Imperative. Show expected output.>

## Step 2 — <action>

<…>

## What you built

<Recap.>

## Next

- [<Single most natural next step>](…)
```

### 13.2 How-to

```markdown
---
title: How to <goal>
type: how-to
audience: <persona>
section: <docs|learn>
status: draft
---

# How to <goal>

<One-paragraph framing.>

## <Step or decision>

<Imperative.>

## <Step or decision>

<…>

## Verifying

<One check.>

## See also

- [<Related reference>](…)
- [<Related explanation>](…)
```

### 13.3 Reference (glion package)

```markdown
---
title: "@glion/<name>"
type: reference
section: docs
status: stable
---

# @glion/<name>

<One-sentence description.>

## Install

\`\`\`bash
npm install @glion/<name>
\`\`\`

## Exports

| Name | Type | Description |
| ---- | ---- | ----------- |

## API

### <symbol>

<Signature.>

**Parameters**

- `<name>` — <type>. <description>

**Returns** — <type>.

\`\`\`ts
// Minimal usage.
\`\`\`

## See also

- [<Related package>](…)
- [<How-to that uses this>](…)
```

### 13.4 Reference (HL7v2 entity)

```markdown
---
title: <Identifier> — <Short name>
type: reference
section: references
hl7v2_version: "2.5"
status: stable
---

# <Identifier> — <Short name>

<One-sentence description from the standard.>

## Definition

|               |     |
| ------------- | --- |
| Length        | …   |
| Datatype      | …   |
| Optionality   | …   |
| Repeatability | …   |
| Table         | …   |

## Components

<Table when composite.>

## Standard reference

<Link to the canonical HL7-published source for this version.>
```

### 13.5 Explanation

```markdown
---
title: <Topic>
type: explanation
audience: <persona>
section: <docs|learn>
status: draft
---

# <Topic>

<Place the topic. Why does it matter?>

## <Aspect>

<Discussion.>

## <Aspect>

<…>

## Trade-offs

<Honest accounting.>

## Further reading

- [<External authoritative source>](…)
- [<Related ADR>](…)
- [<Related concept>](…)
```

## 14 · For agents writing or editing docs

If you are an agent (Claude, Cursor, similar) being asked to write or edit a documentation page on `glion.dev`, follow this procedure.

1. **Read this document first.** Specifically §3 (IA), §4 (boundary rules), and §6 (the quadrant for the page you are touching).
2. **Identify the type before writing.** State to yourself: "This is a how-to guide for healthcare developers in `/docs/guides/`." If you cannot, run the compass in §2.
3. **Confirm the section.** A page about glion goes in `/docs`. A page about HL7v2 the standard goes in `/learn`. A page of facts about a specific HL7v2 version goes in `/references`. If unsure, ask the user before writing.
4. **Use the matching template from §13.** Do not invent a new page shape.
5. **Match voice to type (§6 and §7.1).** Tutorials guide. How-tos direct. Reference describes. Explanation discusses.
6. **Run the §10 checklist before declaring done.** Especially the type/voice/persona alignment.
7. **Do not create empty sections.** If a template heading has no content, delete the heading. The template is a starter, not a contract.
8. **Do not duplicate package READMEs.** If you are writing reference for a glion package, edit the package's `README.md`. The docs site renders it.
9. **Surface ambiguity, do not paper over it.** If the page wants to be two types at once, stop and tell the user. Do not produce a hybrid.
10. **American spelling. No marketing adjectives. Active voice.**

The framework's purpose is to keep documentation honest and navigable as it grows. Every shortcut taken now is a future contributor's confusion.
