# ADR 0003: Standardize Lint Diagnostic Messaging

## Status

Accepted

## Context

- Each `@rethinkhealth/hl7v2-lint-*` package surfaces findings through `vfile.message`, but the phrasing, tone, and level of guidance varies per rule.
- Some rules rely on fallback strings such as `field(s)` rather than true pluralization, while others omit actionable hints or point to imprecise ranges.
- Downstream tooling (editor integrations, CI annotations, docs) surfaces these messages verbatim, so inconsistency erodes trust and makes it harder to correlate findings across packages.
- A concise, repeatable style guide keeps diagnostics predictable for users and reduces rework when adding new lint rules.

## Decision

- **Single style guide:** Lint messages follow a `<what happened> (<where/why>) — <next step>` structure; they should be clear, neutral, and free of jargon.
- **Pluralization:** Use the shared `pluralize@8.0.0` dependency (with `@types/pluralize`) for any count-driven noun to avoid `(s)` shims.
- **Location data:** Always include the most specific `place` (line/column range) available so editors can highlight the offending HL7 element.
- **Actionable hints:** When a remediation is obvious (e.g., “remove trailing empty fields”), append a short imperative clause so users know how to resolve the warning.
- **Origin metadata:** Keep `origin` and `url` populated so aggregators can deep-link to documentation for each rule.
- **Testing:** Every lint package must assert on its user-facing strings (including pluralization and hints) to catch regressions when templates change.

## Consequences

- Diagnostic strings read consistently across linters, tutorials, and CI logs, improving usability and reducing support questions.
- Shared dependencies (`pluralize`, `@types/pluralize`) remain part of the linting toolchain, so new rules automatically inherit the style without bespoke helpers.
- Capturing precise `place` data nudges implementers to preserve positional metadata inside visitors, improving the overall quality of developer tooling.
- Codifying expectations in tests raises confidence when adjusting copy or translating the guidance into other channels (docs, changelog examples, etc.).
