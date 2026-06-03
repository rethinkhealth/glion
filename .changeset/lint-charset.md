---
"@glion/lint-charset": minor
"@glion/mllp-charset": minor
"@glion/preset-lint-recommended": minor
"@glion/hl7v2": minor
---

Add an `MSH-18` character-set lint rule and a server strict-mode gate, so a message that declares an encoding the runtime cannot decode is caught up front instead of failing deep in the UTF-8 decode path (#662).

- Add `@glion/lint-charset` — an `hl7v2-lint` rule that checks every `MSH-18` repetition against an allow-list (default `["UNICODE UTF-8", "ASCII", "ISO IR6"]`, the UTF-8-compatible HL7 table 0211 codes), matched case-insensitively. An absent or empty `MSH-18` passes (the spec default is ASCII). The allow-list is configurable via the `allow` option. The package also exports `CHARSET_RULE_ID`, `HL7V2_LINT_SOURCE`, and `DEFAULT_ALLOWED_CHARSETS`.
- Add `@glion/mllp-charset` with `charsetMiddleware()` — an MLLP middleware that runs the pipeline (`await ctx.tree()`), and on a fatal charset diagnostic throws `AckApplicationReject` (MSA-1 `AR`, ERR-3 `102`). Registered inside `ackMiddleware`, that becomes an `AR` NAK; this is the rule-reports / server-decides split — the rule never aborts the pipeline itself.
- Change `@glion/preset-lint-recommended` to include `@glion/lint-charset` at `error` severity. This flows into the default `@glion/hl7v2` (`parseHL7v2`) pipeline, which now emits a fatal diagnostic for a non-UTF-8 `MSH-18`. This complements `@glion/util-charset`, which enforces UTF-8 at the byte layer (#659): the decoder governs the actual wire bytes, this rule governs the charset a message _declares_ in `MSH-18`.
