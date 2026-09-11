---
name: glion-tsdoc
description: Write or audit TSDoc comments in the glion monorepo. Use whenever adding, editing, or reviewing a `/** ... */` block on a module, function, class, interface, type, or member — including when the change is incidental to other work.
---

# glion-tsdoc

TSDoc in this repo states **what a symbol is and what its contract is**. Nothing else.

It is not a place to explain why the design is shaped this way, to compare it against an alternative, to narrate how the layers relate, or to make the design sound good. That material belongs in a PR description, an ADR, or `docs/`. A reader of a type wants to know what to implement; a reader of a function wants to know what to pass and what comes back.

This applies to `@module` blocks, exported symbols, private helpers, and single-line member docs alike.

## The rule

Every doc block is some subset of these, in this order:

1. **What it is / what it returns.** One declarative sentence. No preamble.
2. **Contract clauses.** MUST / MUST NOT, idempotent, never rejects, bounded, ordering, what it reads or writes, defaults.
3. **Tags.** `@param`, `@returns`, `@throws`, `@module`.

Nothing else earns a line.

## Banned

These phrasings signal drift. If a sentence contains one, delete the sentence — do not rewrite it.

| Pattern                                                            | Example caught in review                                                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Justifying the design                                              | "Opening is a capability here rather than a factory the client calls, so that…"                               |
| Comparing to the alternative                                       | "…not a factory the client calls", "…rather than leaving it to the caller"                                    |
| Flattering the design                                              | "which is exactly what the caller wants and never has to know"                                                |
| Explaining the return type to itself                               | "There are no streams before this resolves, which is the whole reason it returns them"                        |
| Rhetorical framing / quoted questions                              | "this answers only \"did the remote system refuse, and how\""                                                 |
| Ownership narrative                                                | "The client owns this mapping, not the acknowledgment", "What those mean is for whoever is reading the reply" |
| Selling the ergonomics                                             | "so a caller tells \"the remote system said no\" from \"the client or the wire failed\" by class alone"       |
| `so that` / `which is why` / `because` attached to a design choice | "…and it is the same on every runtime, which is why an adapter never sees a frame"                            |
| Restating the code                                                 | "and the timer is what bounds this even when the remote system never sends its own FIN"                       |
| Marketing adjectives                                               | powerful, robust, elegant, simple, clean, easy                                                                |

A `because` clause is allowed in exactly one case: attached to a **MUST**, where the reason is what makes the requirement non-negotiable, and it fits in one clause. Example: _"The caller MUST close the connection on `MllpInvalidResponseError`: MLLP is lockstep, so an unreadable reply leaves the wire at an unknown position."_

## Keep a WHY only when it is one of these

- **A spec reference.** "MSA-2, which HL7v2 also calls the Message Control ID."
- **A real-world workaround.** "The grace window avoids the FIN-immediately-followed-by-RST sequence that some integration engines log as a protocol error."
- **A platform constraint.** "Each `connect()` dials a fresh `net.Socket`: Node cannot reconnect one that has been destroyed."
- **A tracked deferral.** "MSH-9 and the HL7 version are not checked (#668)."

Each is a fact a reader cannot derive from the code. Design rationale is not.

## Before / after

```ts
// ✗ drift
/**
 * One socket to one remote system: open it, use its streams, end it.
 *
 * The client holds one for its whole life and drives it through this
 * interface. Opening is a capability here rather than a factory the client
 * calls, so that a socket can be opened again after it has been closed
 * without the client having to learn where sockets come from.
 */

// ✓ contract
/** A socket to one remote system. */
```

```ts
// ✗ drift
/**
 * The exception the acknowledgment in `tree` carries, or `undefined` when
 * MSA-1 is not a NAK — an accept, or not a code at all. What those mean is for
 * whoever is reading the reply; this answers only "did the remote system
 * refuse, and how".
 *
 * The same `@glion/ack` types the server raises, so a caller tells "the remote
 * system said no" from "the client or the wire failed" by class alone.
 */

// ✓ contract
/**
 * The exception the acknowledgment in `tree` carries, or `undefined` when
 * MSA-1 is not a NAK.
 *
 * Reads MSA-1 for the class, MSA-2 for `controlId`, ERR-3 for `errorCode`,
 * ERR-4 for `severity`, and MSA-3 (or ERR-8) for `text`.
 */
```

Contract clauses stay terse and stack as fragments, not prose:

```ts
/**
 * Ends the socket `connect()` opened, and resolves once it is down.
 *
 * Never rejects. Idempotent. Bounded, even when the remote system does not
 * answer. An attempt still in flight is cancelled through its signal.
 */
```

## Inline comments

Same rule, one step looser — see CLAUDE.md §10. Default to none. A comment earns its place only for a non-obvious invariant, a deliberate trade-off, a platform workaround, or a spec section. Never reference the current task or PR.

## Self-check

Read each block back and ask, sentence by sentence:

- [ ] Does this tell the reader **what** the symbol is, or **what it guarantees**? Keep.
- [ ] Does it tell them **why we built it this way**, or how it compares to what we didn't build? Delete.
- [ ] Could it be moved verbatim into a PR description and read naturally there? Delete.
- [ ] Does it restate what the next line of code plainly says? Delete.
- [ ] Is there a `so that`, `which is why`, `rather than`, or `not a` clause? Delete unless it is a spec fact, a platform constraint, or a one-clause reason on a MUST.
- [ ] Does the first sentence start with the thing itself, not with framing? ("A socket to one remote system", not "This interface represents…")

## Auditing existing files

When asked to fix TSDoc across a file or package: sweep every `/** */` block, apply the self-check, and report what was cut by category rather than diffing each one. Do not "improve" blocks that already pass — terse is finished, not unfinished.
