# 18. Fault Tolerance Principles

Date: 2026-05-24

## Status

Proposed

## Context

Glion processes HL7v2 — the wire format that hospitals, labs, and pharmacies
use to exchange clinical events. A lost or corrupted ADT, ORU, or ORM is not
a missed analytics event; it can mean a misdosed patient, a missed lab
result, or a billing dispute. Consumers run Glion as a library inside an
integration engine, as a CLI in a pipeline, or as an MLLP listener that has
to stay up while a partner system flaps.

The `unified` pipeline already gives us composition. The
[Design Philosophy in `CLAUDE.md`](../../.claude/CLAUDE.md) already gives us
code-shape guidance (no silent error swallowing, errors at the layer that
owns them, real types over thenable lookalikes, documentation contracts
over runtime defense, etc.). What we are missing is a single statement of
the **system-level** properties Glion is engineered to hold under stress —
the properties that decide whether a hospital integration silently rots at
3 a.m. or stays loud and recoverable.

PlanetScale's [Principles of Extreme Fault
Tolerance](https://planetscale.com/blog/the-principles-of-extreme-fault-tolerance)
gives a concise frame for those properties — independence, non-cascading
failure, minimal critical-path dependencies, rigorous separation of control
and data planes, rehearsed failover, durable replication, progressive
rollout, and the recognition that the principles are simple but the
execution is the work. The principles transfer well to a healthcare
messaging stack: an HL7v2 toolkit is a small distributed system in disguise
(network transport, framing, parsing, transformation, validation, ACK,
persistence), and the same shape of failure modes apply.

This ADR translates those principles into rules of practice for the Glion
codebase. It is the standard against which architectural changes,
adapters, plugins, and lint rules are evaluated.

## Decision

We adopt the following ten principles. They are project-level invariants:
they bind every package in `packages/`, every adapter we ship, and every
plugin we recommend.

### 1. Independent parts

Every package owns one concern and depends on the minimum surface needed
to express it. Plugins, adapters, codecs, and lint rules compose through
the unified pipeline and through documented interface types — not through
shared mutable state, not through registries, not through implicit ordering.

- A new plugin should be droppable into any compatible pipeline without
  importing a sibling plugin's internals.
- A transport adapter (Node `net`, Deno, Workers, mock) must satisfy the
  same documented duplex contract; the core must not branch on which
  adapter is active.
- Package boundaries mirror failure domains. If two responsibilities can
  fail independently, they live in two packages.

### 2. Failures do not cascade across stages

A failure in one pipeline stage surfaces as a `vfile` message or a typed
error and stops at the stage that produced it. Downstream stages observe
the failure as data, not as undefined behavior.

- A failing transformer must not corrupt the AST seen by other transformers
  on a sibling message.
- A malformed inbound MLLP frame must be reported on that connection only;
  the server, other connections, and other in-flight messages keep running.
- A lint rule's crash must be containable: the runner reports the rule as
  failed, continues with the remaining rules, and exits non-zero.

### 3. The critical path is thin

For Glion, the **critical path** is: bytes → MLLP frame → HL7v2 AST → ACK
bytes. That path carries patient data and decides whether an ACK is
emitted. It must depend on the smallest set of modules that can express
parsing, ACK generation, and framing.

- No optional features hide in the critical path. Profile annotation,
  schema validation, escape decoding, jsonification — all opt-in
  middleware, all bypassable.
- No network I/O except the transport itself. No registry lookups, no
  remote schema fetches, no telemetry blocking the ACK.
- Adding a dependency to a critical-path package requires an ADR.

### 4. Separation of the control plane and the data plane

The **data plane** is the per-message processing path: parse, transform,
validate, ACK. The **control plane** is everything that configures it:
loading profiles, wiring plugins, hot-reloading lint rules, serving admin
endpoints, emitting metrics, writing logs.

- A control-plane failure (profile load error, metrics sink down, config
  reload race) must not stop the data plane from acknowledging the messages
  it is already configured to handle.
- Configuration is resolved at construction time of the processor or
  server. Per-message paths read from frozen state.
- Hot-reload of profiles or rules is an explicit, scoped operation; it
  swaps a frozen snapshot rather than mutating live state.

### 5. Errors belong to the layer that owns them

Adapters absorb their own teardown errors and idempotency quirks. Core
trusts adapter contracts. Plugins surface domain errors through `vfile` or
typed errors. Servers translate unhandled errors into NAKs with the
correct HL7v2 acknowledgment code; they do not silently drop.

- `MllpDuplexStream.close()` **must** resolve and **must** be idempotent.
  The core awaits it in `finally` and fires-and-forgets it from abort
  paths; it does **not** wrap it in `try/catch` to "be safe."
- A plugin that needs to fail loudly throws a real `Error` with a
  descriptive message; it does not write to `console`, does not swallow,
  does not return a sentinel.
- See Design Philosophy §2, §3, §8, §9 — this principle is the system-level
  statement of the same rule.

### 6. Bounded resources at every boundary

Healthcare partners send malformed, oversized, and adversarially shaped
messages. Every place Glion accepts bytes must enforce a bound — frame
size, segment count, repetition depth, field length, connection count,
concurrent in-flight messages, parse time budget.

- Decoder buffers have a hard maximum frame length; exceeding it raises a
  typed `MLLPError` and closes the offending connection without affecting
  others.
- Stream pipelines propagate backpressure. The MLLP server must not buffer
  unbounded inbound bytes while a downstream consumer stalls.
- Per-connection work is canceled by `AbortSignal` when the connection
  drops; outstanding work releases promptly.

### 7. Acknowledgment is a durable contract

HL7v2 acknowledgment levels exist because senders rely on the ACK as proof
of custody. Glion treats ACK semantics as a contract with the sender, not
a formality.

- `AA` (Application Accept) must not be emitted until the application has
  taken whatever durable action it promised (committed to storage, enqueued
  durably, etc.).
- `mode: "OnApplication" | "OnCommit"` — names mirror HL7v2 §2.9.2; they
  describe what the sender is being told, not how we implement it.
- `AE`/`AR` carry actionable diagnostic text in `MSA` and `ERR` segments;
  they are not generic "something went wrong" placeholders.
- A consumer that cannot honor `OnCommit` must reject the configuration at
  startup, not silently downgrade.

### 8. Connection and message isolation

Every TCP connection, every in-flight message, and every plugin invocation
is isolated from its neighbors. One slow connection does not block
another; one poison message does not break the consumer for the next
message on the same connection.

- The server handles connections concurrently with no shared mutable state
  on the per-connection path.
- A NAK on message _n_ does not corrupt the state for message _n+1_ on the
  same connection.
- Plugin invocation is per-message; transformers do not carry per-run
  state across messages unless an explicit, documented scope says so.

### 9. Failure modes are tested, not assumed

The contracts above are only as real as the tests that exercise them. We
test failure paths at the layer that owns them — adapter behavior at the
adapter, framing at the framer, ACK content at the ACK generator,
end-to-end recovery at the server.

- Every adapter has tests for: connection drop mid-frame, peer abort,
  oversized frame, duplicate close, close-then-write race.
- The decoder has tests for: split frames across chunks, garbage between
  frames, truncated end bytes, embedded NULs.
- The MLLP server has tests for: per-connection isolation, NAK on parse
  failure, graceful shutdown with in-flight messages.
- Benchmarks (`benchmarks/`) include a poison-message and a
  slow-consumer scenario, not just throughput on a clean stream.

### 10. Simple parts, executed carefully

The previous nine principles are intentionally unsurprising. The work is
in the execution: the test that actually exercises a connection drop, the
JSDoc that actually states the contract, the dependency that actually got
removed from the critical path, the adapter that actually honors
idempotent close on Bun as well as Node.

When in doubt, the simplest implementation that satisfies the real failure
modes wins. Defaulting to defense — `try/catch` around contracts,
`ignoreErrors` helpers, "just in case" retries, "future-proof"
abstractions — is how a fault-tolerant system rots into a fault-_hiding_
one. (See Design Philosophy §1, §11, §12.)

## Consequences

- **Architectural review has a checklist.** New packages, new adapters,
  and new plugins are evaluated against these ten principles. ADRs that
  introduce critical-path dependencies, blur the control/data-plane
  boundary, or weaken the ACK contract must justify the deviation
  explicitly.
- **Critical-path dependencies are explicit.** The packages on the
  bytes→ACK path (`@glion/mllp`, `@glion/mllp-transport`, `@glion/parser`,
  `@glion/ast`, `@glion/ack`, `@glion/mllp-ack`) carry a smaller, slower
  changing dependency surface than the plugin packages. Adding a runtime
  dep to one of them requires an ADR amendment.
- **Adapter contracts are documented loudly.** Adapter modules carry
  JSDoc that states their MUST/MUST-NOT obligations (idempotent close,
  resolving teardown, AbortSignal honoring) in the file they belong to.
  Core code trusts those contracts and does not re-guard them.
- **Test suites pull their weight.** Each runtime package owns failure-mode
  tests at its layer. CI fails on regressions in those tests as visibly
  as on regressions in happy-path tests; we do not gate them behind
  optional or "flaky" tags.
- **Plugins inherit the policy.** Plugin authors (internal and third
  party) read this ADR alongside `CLAUDE.md`'s Design Philosophy as the
  baseline for what "production-grade Glion plugin" means: no
  `console.*`, no silent swallowing, errors surfaced as `vfile` messages
  with `place` and `origin`, no leaked control-plane state.

## Alternatives Considered

- **Leave the principles implicit in `CLAUDE.md`.** The existing Design
  Philosophy is excellent for code shape, but it does not name
  system-level properties (control/data plane split, bounded resources,
  ACK durability, connection isolation). Architectural reviews and
  adapter authors need that named vocabulary.
- **Adopt PlanetScale's wording verbatim.** PlanetScale is a hosted
  database service; their language ("data plane", "control plane",
  "failover", "replicas") maps but does not literally apply. A direct
  translation to HL7v2 / MLLP / unified terms is more useful to
  contributors who will not be reading PlanetScale's blog before sending
  a PR.
- **Defer until a real incident.** Healthcare integrations are
  high-consequence and operate inside customer environments where we
  rarely see the incident. Codifying the principles up front sets the
  bar for changes; codifying them after an incident is reactive and
  inevitably narrower than the failure surface.

## References

- PlanetScale, _The principles of extreme fault tolerance_ —
  <https://planetscale.com/blog/the-principles-of-extreme-fault-tolerance>
- [`CLAUDE.md` Design Philosophy](../../.claude/CLAUDE.md) — code-shape
  principles that this ADR composes with
- [ADR 0011 — MLLP Transport Server](./0011-mllp-transport-server.md) —
  the package where most of these principles get exercised
- [ADR 0013 — MLLP Lazy Pipeline Execution](./0013-mllp-lazy-pipeline-execution.md)
- HL7v2 §2.9 (Acknowledgment) — the spec the ACK contract in §7 names
