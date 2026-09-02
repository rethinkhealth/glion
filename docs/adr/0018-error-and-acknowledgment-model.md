# ADR 0018: Errors, Exceptions, and Acknowledgments in the HL7v2 Ecosystem

## Status

Proposed

> **Update (2026-08):** `@glion/mllp-transport` was renamed to `@glion/mllp-codec`, and `FramingError` / `FramingErrorCode` became `MllpCodecError` / `MllpCodecErrorCode` (codes renamed: `MISSING_START_BLOCK` → `UNEXPECTED_DATA`, `MISSING_END_BLOCK` → `INCOMPLETE_MESSAGE`, `FRAME_TOO_LARGE` → `MESSAGE_TOO_LARGE`, `EMBEDDED_CONTROL_CHAR` → `RESERVED_CHARACTER`). The client also stopped leaking the codec type: `MllpClient.send()` wraps a reserved-character failure as `MllpClientError` `INVALID_MESSAGE` with the codec error on `cause`, and the server reports byte-stream violations to `onError` as `MllpServerError` `PROTOCOL_VIOLATION`. Package and class names below are otherwise left as written.

## Context

The `@glion/*` ecosystem surfaces "something went wrong" through **three
distinct channels**, and until now there was no shared rule for which channel a
given failure belongs in or how each channel should be shaped. The channels:

1. **Thrown `Error` subclasses.** Several packages define their own error
   classes: `FramingError` (`@glion/mllp-transport`), `MllpClientError`
   (`@glion/mllp-client`), the `AckException` family (`@glion/ack`),
   `GlionError` (`@glion/glion` CLI), `ConfigurationError` (`@glion/config`),
   `RangeParseError` / `VersionParseError` (`@glion/util-semver`).
2. **`unified` / VFile messages.** The parsing and validation pipeline
   (`@glion/parser`, `@glion/hl7v2`, every `@glion/lint-*`, the
   `@glion/annotate-*` plugins) reports findings as `file.message()` entries
   attached to the VFile — diagnostics as **data on the tree**, not throws.
   This channel is already governed by [ADR 0003](./0003-lint-diagnostic-style.md)
   (diagnostic style) and [ADR 0014](./0014-file-data-vs-node-data.md)
   (where the data lives).
3. **The HL7v2 acknowledgment (ACK) itself.** A receiver answers a message with
   an ACK whose MSA-1 is an accept (`AA`/`CA`) or a negative acknowledgment —
   **NAK** — (`AE`/`AR`/`CE`/`CR`, HL7v2 Table 0008). A NAK is the protocol's
   _own_ application-level error mechanism. It is simultaneously a **domain
   object** (an HL7v2 message) and an **error signal**, and it crosses the wire
   in **both directions**: a client _receives_ NAKs; a server _sends_ them.

The lack of a shared model produced real drift. The `@glion/mllp-client` rebuild
went through a phase with a dual taxonomy (a `code` enum **and** a parallel set
of error subclasses) applied inconsistently; `@glion/ack` was at one point
slated to be dropped and its concerns inlined/duplicated into the client and the
server. Both were symptoms of the same gap: no agreed answer to "how do we model
errors, and where does the ACK fit?"

The ACK question is the subtle one. A NAK is **not** a transport failure — the
socket, the framing, and the parse all _succeeded_; the peer understood the
message and refused it. That is categorically different from "the connection
dropped" or "the bytes were unframable," and it has the opposite retry
semantics. It also must be expressed by the **same vocabulary** on both sides of
the wire, or the client's notion of a NAK and the server's notion of a NAK
drift apart.

## Decision

Adopt a three-channel error model with the ACK as a first-class, shared error
domain.

### 1. Validation findings are data, not exceptions

A malformed-but-parseable message does **not** throw. Parsing, transformation,
and linting run inside the `unified` pipeline and accumulate findings as
`file.message()` on the VFile (per ADR 0003 / 0014). Throwing here would abort
the pipeline, discard the partially-built AST, and break plugin composability.
Reserve thrown errors for the parser's _unrecoverable_ cases (input that cannot
yield a tree at all).

### 2. Thrown errors: one base class per package, discriminated by `code`

Every package that throws defines **one** base `Error` subclass carrying a
stable, exhaustive `code: string`. The `code` is the contract callers branch on;
a `switch` on it never needs to inspect internal state.

- **Subclass only for a category that carries distinct typed fields a caller
  reads** — never to restate what `code` already says. Code-specific detail
  rides on optional fields populated only for the relevant codes (e.g.
  `MllpClientError.reason` for `DROPPED`, `timeoutMs` for the timeouts,
  `expected`/`actual`/`tree`/`raw` for `CORRELATION_MISMATCH`).
- **Always set `cause`** when wrapping an underlying failure; never swallow.
- **Errors belong at the layer that owns them.** A layer lets a lower layer's
  error propagate, or wraps it with `cause` — it does not re-encode another
  layer's failures as its own taxonomy.

Reference implementations: `FramingError` + `FramingErrorCode`,
`MllpClientError` + `MllpErrorCode`. The single deliberate exception to
"subclass only for fields" is a **domain taxonomy** — see §3.

### 3. The ACK is a first-class, shared error domain owned by `@glion/ack`

`@glion/ack` is the central ACK package for the whole ecosystem. Its
`AckException` family maps HL7v2 Table 0008:

| Class                  | MSA-1 | Meaning                           |
| ---------------------- | ----- | --------------------------------- |
| `AckApplicationError`  | `AE`  | understood, application error     |
| `AckApplicationReject` | `AR`  | rejected at the application level |
| `AckCommitError`       | `CE`  | could not be committed/persisted  |
| `AckCommitReject`      | `CR`  | rejected at the commit level      |

These subclasses are the **deliberate exception** to §2's "subclass only for
fields" rule. They carry the same fields, but they encode **distinct domain
concepts a caller branches on** (reject vs. error; application vs. commit, with
different retry semantics) and they _are_ the canonical HL7v2 taxonomy — not a
second encoding of a `code`. `instanceof AckException` catches any NAK;
`instanceof AckApplicationReject` catches a specific one.

The family is **bidirectional and wire-symmetric** — one vocabulary, both
directions, no drift:

- The **server** throws an `AckException` and serializes it to an _outbound_
  NAK via `acknowledge()` / `toErrSegment()` (consumed by `@glion/mllp-ack`).
- The **client** parses an _inbound_ NAK and throws the **same**
  `AckException`, reading ERR-3 / ERR-4 into `errorCode` / `severity` and
  carrying `raw` + the parsed `tree`.

`@glion/ack` does **not** re-implement parsing: a received ACK is parsed with
`@glion/parser` and read with `@glion/util-query`, then surfaced through these
types. `errorCode` / `severity` are optional and typed `string` (not the strict
Table 0357 / 0516 enums) so an inbound NAK with a non-standard or absent ERR
segment round-trips faithfully.

### 4. Two buckets at the protocol boundary

A consumer of `MllpClient.send()` distinguishes exactly two failure buckets, and
they are **separate hierarchies caught separately** — deliberately not merged:

- **"The wire/protocol failed, or the call was misused."** →
  `MllpClientError` (connect/send timeout, peer drop, framing error, parse
  failure, state guard) or `FramingError` (outbound framing). The message never
  reached the peer, or the peer's reply was unintelligible.
- **"The peer understood the message and said no."** → an `@glion/ack`
  `AckException`. Delivery and parsing succeeded; this is an application
  decision.

Merging the two would re-duplicate the ACK domain into the client and conflate
"could not deliver" with "delivered and refused" — failures with opposite retry
semantics.

### 5. Throw-on-NAK is the default

`send()` **throws** the `AckException` on a NAK rather than returning a
result-union; the success type `MllpClientResponse` is the happy path only. This
matches mainstream client convention (AWS / MongoDB / Stripe SDKs): the happy
path returns a value, the error path throws, and detail is read off the thrown
error. A caller that wants to inspect a NAK without `try/catch` catches it; a
`sendNoThrow()` variant is not on the roadmap until a concrete consumer needs it.

### 6. The `code` is for machines; the `message` is for the human reading the log

A thrown error carries two payloads with different audiences. The `code` (and
the typed fields) is the **machine** contract — stable, branched on in a
`switch`. The `message` is for the **operator** staring at a log line at 3am, and
it must stand on its own there. This mirrors the lint-diagnostic style of
[ADR 0003](./0003-lint-diagnostic-style.md), applied to thrown errors:

- **Lead with the operation and its concrete context** — the `host:port`, the
  current state, the elapsed timeout, the value actually seen. _"Connect to
  hl7.example.org:2575 timed out after 30000ms"_ beats _"connect timed out"_.
- **Explain in domain terms, not implementation terms.** _"the connection was
  closed while it was still being established"_ beats _"interrupted by
  `close()`"_. A method name is not an explanation.
- **Surface the values that aid triage** — the mismatched IDs, the unexpected
  code, the byte/frame count — not a bare category.
- **Append an actionable next step when the caller can act** — _"construct a new
  client to reconnect"_ — or name the likely cause — _"usually a late ACK from a
  previously-timed-out request"_.
- **Do not restate the `code` in the `message`.** The code is already a field;
  the prose should be self-explanatory without it.
- **Never leak secrets or full payloads** into the message; identifiers
  (control IDs, host/port) are fine, message bodies are not.

Structure follows ADR 0003: `<what failed, with context> — <why / next step>`.
Worked example (an actual fix this ADR motivated):

```ts
// Weak: no context, leaks an implementation detail as the "reason".
throw new MllpClientError(CONNECT_ABORTED, "Connect interrupted by close()");

// Strong: what failed, where, why, in domain terms.
throw new MllpClientError(
  MllpErrorCode.CONNECT_ABORTED,
  `Connect to ${host}:${port} was interrupted: close() was called while the ` +
    "connection was still being established."
);
```

Every package must assert on its user-facing error strings in tests (as the
lint packages already do per ADR 0003) so copy regressions are caught.

## Consequences

- **One mental model for consumers.** Branch on `error.code` for client/transport
  errors; `catch (e) { if (e instanceof AckException) … }` for NAKs; read
  `file.messages` for validation findings. Three channels, three clear shapes.
- **No client/server ACK drift.** The builder of an outbound NAK and the thrower
  of an inbound NAK are the same types, so the two sides cannot disagree about
  what a NAK is or carries.
- **A rule for library authors.** New `@glion/*` packages get: one base error +
  a `code`; subclass only for field-carrying categories or a canonical domain
  taxonomy; validation findings go through VFile, not throws; and a message
  checklist (§6) so error strings are useful in a log, not just present.
- **Two hierarchies at the protocol boundary (accepted trade-off).** A
  `send()` caller may need to handle both `MllpClientError` and `AckException`.
  This is intentional: the conceptual split ("undeliverable" vs. "refused") is
  real and worth surfacing rather than hiding behind one type.
- **Throw-on-NAK requires a `try/catch` for inspection (accepted trade-off).**
  Justified by mainstream convention; revisited only if a real consumer needs a
  non-throwing variant.

## Alternatives considered

- **A single ecosystem-wide error root (`GlionError` for everything).** Rejected:
  it couples unrelated packages and forces a transport consumer to import the
  lint/parse error surface. Each package owning its base keeps dependencies
  honest.
- **Subclass-per-condition in the client (the dual taxonomy).** Rejected:
  redundant with `code`, and it was applied inconsistently in practice. The
  client was refactored to a single `MllpClientError` discriminated by `code`.
- **NAK as a return-value union instead of a throw.** Rejected: throw-on-NAK
  keeps the happy path clean and matches mainstream clients; for most callers a
  NAK is genuinely exceptional.
- **Merging `AckException` into `MllpClientError`.** Rejected: conflates
  "could not deliver" with "delivered and refused," and would re-duplicate the
  ACK domain the central `@glion/ack` package exists to own.
- **Validation findings as thrown errors.** Rejected: would abort the `unified`
  pipeline and discard the partial AST (see ADR 0003 / 0014).

## Related

- [ADR 0003: Standardize Lint Diagnostic Messaging](./0003-lint-diagnostic-style.md)
- [ADR 0014: File Data vs Node Data](./0014-file-data-vs-node-data.md)
- [ADR 0011: MLLP Transport & Server](./0011-mllp-transport-server.md)
- [ADR 0013: MLLP Lazy Pipeline Execution](./0013-mllp-lazy-pipeline-execution.md)
