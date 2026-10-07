# ADR 0026: Message Strings

## Status

Accepted (2026-10-07)

Supersedes ADR 0003. Amends ADR 0018 §6, whose content rules for thrown errors stand; this ADR sets the form of the string.

## Context

Glion writes text for two readers. A lint rule reports a finding on a message through `file.message` (ADR 0003); a library throws a typed error with a stable `code` (ADR 0018). Both strings reach a person: an integration analyst reading CI output or an editor, an operator reading a log.

The lint strings are assembled from parts. `lint-required-message-header` joins a shared prefix to a runtime clause (`` `${REQUIRED} — received '${name}' instead` ``), and choosing the clause for an empty Segment ID took a ternary that returned half a sentence. Other rules put every value in parentheses at the end (`exceeds max length of 20 (actual: 25)`). The result reads as concatenated, and the values exist only inside the prose: `VFileMessage` has `actual`, `expected`, `note`, and `url` fields, and no rule sets them.

Organizations that publish error messages converge on the same rules:

- **A stable code apart from the prose.** Stripe's `code`, AWS's `Code`, Google's `ErrorInfo.reason` (AIP-193), rustc's `E0308`, ESLint's `messageId`. The prose may change; the code may not.
- **One complete message per cause.** Microsoft: "Best practice is to never concatenate strings. Even when there are many cases, write out each sentence completely", and "Write a separate error message for each known cause of the error." ESLint keeps a rule's messages in one `meta.messages` catalog keyed by `messageId`.
- **Values in fields as well as in the text.** AIP-193: "Any request-specific information which contributes to the `Status.message` … must be represented within `metadata`." Stripe carries the parameter in `param`; vfile carries the found value in `actual` and the acceptable values in `expected`.
- **The fact, then what is expected or how to fix it.** Stripe: "The specified amount is greater than the maximum amount allowed. Use a lower amount and try again." Microsoft: a message answers "What happened and why? … What can the user do?"
- **Present tense, no blame, specific words.** Microsoft and AWS Cloudscape both forbid blaming the reader; rustc bans "illegal".

They differ on form. Compiler and linter diagnostics (rustc, remark-lint) are terse clauses with no closing period; API and product errors (Stripe, Microsoft, Cloudscape, AIP-193) are sentences. `vfile-reporter` prints the reason, and shows `note` and `url` only in verbose mode; it does not print `actual` or `expected`.

## Decision

1. **The code is the identity; the string is for a person.** A lint finding is identified by its `ruleId`; a thrown error by its class and `code`. No consumer parses a message string. Tests still assert every user-facing string verbatim, so a wording change is deliberate.

2. **Every string is a whole sentence, written out per cause.** A string is never assembled from parts: no shared prefix or suffix constant, no clause chosen by a ternary, no fragment joined with `—`. When the wording differs between two situations, they are two causes with two complete messages. A value is interpolated into its own sentence; a sentence is never interpolated into another.

3. **A lint rule declares its messages in one catalog.** The catalog is a `messages` constant at the top of the rule's module, one entry per cause, named for the cause (`notMessageHeader`, `emptyMessage`). An entry without values is a string; an entry with values is an arrow function whose parameters name them. The report site reads the entry and sets nothing else in the text. A thrown error holds its message in its own class, which already has one cause per `code`.

4. **The form is a sentence.** Sentence case, present tense, ending with a period. It states what was found and what HL7v2 requires, in that order, and joins the two with a semicolon when they share one sentence:

   > The first segment is `PID`; a message must start with the message header segment (`MSH`).

   A fix the reader can act on, or the reason behind the requirement, goes in a second sentence or in `note`. The same form applies to thrown errors; ADR 0018 §6 decides their content.

5. **HL7v2 names things.** Use the standard's terms: Segment ID, field `PID-3`, component `MSH-9.3`, and the element's name where it helps (`PID-3 (Patient Identifier List)`). An implementation term (node, tree, token, array) never appears in a message.

6. **Values are quoted as code and described when empty.** A value from the message, a Segment ID, or a delimiter is wrapped in backticks. An empty or absent value is described in words (`an empty Segment ID`, `no segments`) and is a cause of its own, never `''`.

7. **The values travel in fields too.** A lint finding that compares a found value with acceptable ones sets `actual` to the found value and `expected` to the acceptable values. `note` carries a longer explanation or a reference to the standard when one helps. `url` points to the rule's README, set once through `lintRule`'s `url`. `place` and `ancestors` locate the finding, as ADR 0003 required. A thrown error carries its values on typed properties (ADR 0018).

8. **Counts use `pluralize`**, as ADR 0003 required, inside the catalog entry.

9. **The `glion-messages` skill holds the checklist.** It is read before writing or changing any message string, the way `glion-tsdoc` is read before any TSDoc block.

## Consequences

- Each rule's wording can be read and reviewed in one place, the top of its module.
- Existing lint rules move to the catalog and the sentence form one PR at a time, and so do the thrown errors whose fixed strings join a fact and a next step with `—` (`@glion/mllp-client`); each changes user-facing strings and their tests, released as a patch because the `ruleId` or `code` is the contract.
- Reporters that read `actual` and `expected` (an editor integration, an acknowledgment's ERR segment) get the values without parsing prose.
- Messages are longer than terse diagnostics. The trade-off favors the analyst who reads one finding without the rule's source at hand.

## Alternatives considered

- **rustc's form**, a general lowercase message with the specifics in a span label ("mismatched types", then "expected `i32`, found `&str`"). It depends on a reporter that prints labels; `vfile-reporter` prints only the reason.
- **remark-lint's form**, "Unexpected `X`, expected `Y`", the convention of the unified ecosystem. It is terse but reads as a fragment and leads with the word "Unexpected" for every rule.
- **Inline templates at each report site, without a catalog.** Fewer lines, but a rule's wording is spread across its branches and cannot be reviewed at a glance.

## Related

ADR 0003 (lint diagnostic style, superseded), ADR 0018 §6 (thrown error content). Sources: Stripe API errors (docs.stripe.com/api/errors) and error codes (docs.stripe.com/error-codes); AWS EC2 API error codes (docs.aws.amazon.com/AWSEC2/latest/APIReference/errors-overview.html), Smithy `@error` (smithy.io/2.0/spec/type-refinement-traits.html), Cloudscape error messages (cloudscape.design/patterns/general/errors/error-messages); Google AIP-193 (google.aip.dev/193); Microsoft error message guidelines (learn.microsoft.com/windows/win32/debug/error-message-guidelines) and message formatting (learn.microsoft.com/globalization/internationalization/message-formatting); rustc diagnostics (rustc-dev-guide.rust-lang.org/diagnostics.html); ESLint custom rules (eslint.org/docs/latest/extend/custom-rules); vfile-message (github.com/vfile/vfile-message).
