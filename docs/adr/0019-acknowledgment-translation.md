# ADR 0019: Acknowledgment Translation

## Status

Proposed

## Context

The MLLP server translates application outcomes into HL7v2 acknowledgments through `ackMiddleware` (`packages/mllp-ack/src/ack.ts:46-83`): an optional middleware that wraps `next()` in its own try/catch, normalises every throw into an `AckException`, builds MSH+MSA via `acknowledge()` (`packages/mllp-ack/src/acknowledge.ts`), and appends an ERR segment only when the application supplies an `errSegment` callback.

Review of that design — every claim reproduced against this worktree, not hypothesised — found five defects with one root cause:

1. **An unrouted message is acknowledged `MSA|AA`.** `Mllp.handle()` runs the chain with no terminal when no route matches (`packages/mllp/src/server/mllp.ts`), `next()` resolves cleanly, and the middleware cannot tell "handler ran" from "nothing ran" (`ack.ts:65-74`) — so the sender purges a message nothing processed. Every shipped example hand-rolls `app.on("*", () => { throw new UnsupportedMessageTypeReject(...) })` to dodge it (`examples/starter/src/app.ts`, `examples/mllp-server/src/app.ts`).
2. **Translation is registration-order dependent.** A typed `AckException` thrown from middleware registered before `ackMiddleware` escapes to `#handleError` and, with no `onError`, is rethrown to `serve()` — the peer gets silence. The CLI grew `use(mw, { prepend: true })` purely so telemetry could sit outside the middleware (`packages/glion/src/child/middlewares.ts:9-16`, `runner.ts:127-133`).
3. **Unknown errors leak `error.message` to the wire.** `new ApplicationInternalError(error.message, error)` (`ack.ts:57-60`) flows into MSA-3 (`acknowledge.ts:124`), so `connect ECONNREFUSED 10.0.0.5:5432 (user=…)` or an ORM message — potentially carrying PHI — reaches the trading partner, while this repo refuses payloads on exceptions for exactly that reason (`packages/ack/src/exception.ts:17-23`, ADR 0018 §6). The wire is currently more permissive than the logs.
4. **The operator never sees the error.** The middleware absorbs every throw before `app.onError` and `serve()`'s `onError` can fire — the peer gets the diagnostic, the operator gets nothing.
5. **The one version-dependent job is pushed onto every application.** `errSegment?: (error: AckException) => Segment` (`ack.ts:30`) never receives `ctx.version`, even though MSH-12.1 sits synchronously on every context (`packages/mllp/src/server/context.ts`). No consumer in the repo supplies it, so no NAK on the wire today carries the coded error the `@glion/ack` vocabulary exists to express — the glion→glion round trip is lossy in both halves (`packages/mllp-client/src/ack.ts:143-152` reads only ERR-3/ERR-4 and MSA-3 — neither ERR-2 nor ERR-8 — so even a correct server-side ERR would round-trip without its location, and a ≥2.7 ACK, where MSA-3 is withdrawn, would arrive with `text: undefined`).

Root cause: the error-to-protocol translation lives at a movable position inside the middleware onion instead of at the fixed boundary the framework owns.

Prior art was verified from source (WebFetch), not memory. **Hono**: middleware are pure throwers (`bearer-auth` does `throw new HTTPException(status, { res })`); `compose()` catches at the throwing level and calls the single registered `errorHandler(err, c)`, setting `c.error` and writing the Response so outer middleware _observe_ the error rather than catch it; unmatched routes go to a separate `notFound` slot; there is no error-translating middleware anywhere in Hono. **HAPI HL7v2**: `ApplicationRouterImpl` is the single catch around parse→route→handle; `generateACK(code, ex)` builds the envelope and `AbstractHL7Exception.populateResponse()` branches once on `V25.isGreaterThan(versionOf(response.getVersion()))` — the version-keyed ERR table is library-owned, keyed on the ACK's own version copied from inbound MSH-12, and the application never assembles ERR; unrouted messages are answered by a substituted `DefaultApplication` (AR) — a notFound default, not an exception. **Koa / Express / Fastify / NestJS** converge on the same skeleton: a data-carrying exception, one framework-owned terminal handler, an `expose`-style asymmetry deciding whose text reaches the wire, and a protocol-correct default for both "no route" and "unknown error" — never silence. **HL7 ch.2 §2.9** itself splits the work the same way: the protocol software owns the envelope, the mode decision, and the segment layout; the application owns only the verdict and the error data.

One Hono mechanism deliberately does not transfer. `HTTPException.getResponse()` can be context-free because HTTP status→Response is version- and peer-independent ("getResponse is not aware of Context", per Hono's own docs). An HL7v2 NAK needs the origin MSH (field swap, MSA-2 echo), the version, and app policy — so the exception stays data-only and rendering hangs on the framework handler that has `ctx`. That preserves the bidirectionality of ADR 0018 §3: the client throws the same classes from inbound NAKs (`packages/mllp-client/src/ack.ts`).

This branch (PR #674) established `@glion/ack` as version-agnostic vocabulary and moved `acknowledge()` to `@glion/mllp-ack`, with the stance that **no package ever emits ERR**. This ADR re-opens and reverses that stance: the ERR layout is a closed, normative table keyed on MSH-12 — precisely what a library should own. It also supersedes the middleware-first philosophy in `packages/mllp/README.md` ("Why no default error response?") and restores ADR 0011's default-NAK decision (line 201) while superseding its "and the error message" text policy (§5 below) — and it subsumes open PR #666 (never silent; core NAK floor), whose synthetic re-enter-the-chain step becomes unnecessary once the boundary lives in the core.

## Decision

Acknowledgment translation moves into `@glion/mllp` itself, at a fixed framework-owned boundary. `ackMiddleware` and the `@glion/mllp-ack` package are deleted. `AckException` stays data-only in `@glion/ack`.

### 1. Translation lives at the framework's error boundary — not in a middleware, not on the exception

`compose()` (`packages/mllp/src/server/compose.ts`, today no try/catch) gains a per-level catch, transplanting Hono's verified mechanism: on a throw, set `ctx.error`, invoke the app's single error pipeline, and write the returned Response — so `await next()` never throws, every outer middleware observes `ctx.error` and the final `ctx.res` at its normal position, and the CLI's `{ prepend: true }` ordering coupling stops being a correctness requirement (the overload survives as an ordering preference — see §7). `ctx.error` is the same field PR #666 introduces for decode/parse failures: one field, set wherever the failure occurs, read after `await next()`.

The error pipeline is: user `app.onError(err, ctx)` first — return a Response to take over, return `undefined` to **fall through** to the default renderer (the Fastify `reply.send(error)` / Nest `super.catch()` contract; today `undefined` means silence) — then the built-in renderer: `isAckException(err)` renders the thrown exception; anything else is wrapped as an internal error with a fixed generic wire text (§5).

The pipeline runs **at most once per message** (a once-latch). If it throws — a user `onError` bug, or a renderer defect — `handle()`'s outermost catch answers with a minimal string-built floor (`MSH` + `MSA|AE|<salvaged MSH-10>`), so the peer is never silent for a decodable message. This is HAPI's single-router-catch shape and PR #666's floor, unified into one renderer with one set of defaults.

`handle()` returns a `MessageOutcome { response, error, info }` envelope. `serve()` writes `response` when present and reports `error` through its existing `onError` callback when present — **independently**: a NAK is both. This is what keeps "respond" from ever suppressing "report" (today, with `ackMiddleware` installed, `serve.onError` never fires for handler errors at all), and it retires the `errorMessageInfo` WeakMap side-channel in `mllp.ts` along with the public `getMessageInfo` export (`packages/mllp/src/index.ts`).

### 2. The version table is framework-owned and keyed on the ACK's MSH-12

The renderer lives in one module — `packages/mllp/src/server/acknowledgment/render.ts` — and is a deterministic function of the ACK's own MSH-12, which defaults to echoing the inbound `ctx.version` (MSH-12.1, cached synchronously at context creation). This is HAPI's rule exactly: `populateResponse` branches on the response's version, which `fillResponseHeader` copied from inbound MSH-12. The thrower never sees the version; the application never re-derives the table.

| ACK's MSH-12 (default: echo inbound) | MSH-9                                                                                              | MSA-3                      | ERR                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 – 2.4                            | `ACK^<trigger>` (two components ≤ 2.3); `ACK^<trigger>^ACK` from 2.3.1 (MSH-9.3 exists from 2.3.1) | populated, truncated to 80 | one ERR; ERR-1 = repeating ELD-shaped `segment^sequence^field^code&text&HL70357` (multiple errors = `~` repetitions — the pre-2.5 ACK allows a single ERR; 2.1/2.2 bind table 0060, so the HL70357 coding-system name is best-effort there; HAPI's `populateResponseBefore25` renders every < 2.5 version identically) |
| 2.5 – 2.6                            | `ACK^<trigger>^ACK`                                                                                | populated, ≤ 80 (usage B)  | one ERR **per** error; ERR-1 empty; ERR-2 = ERL from `location`; ERR-3 = `code^label^HL70357`; ERR-4 = severity (default `E`); ERR-8 = wire text, ≤ 250                                                                                                                                                                |
| ≥ 2.7                                | `ACK^<trigger>^ACK`                                                                                | omitted (withdrawn)        | as 2.5 – 2.6                                                                                                                                                                                                                                                                                                           |
| blank / unparseable                  | `ACK^<trigger>^ACK`                                                                                | populated, ≤ 80            | modern (≥ 2.5) layout                                                                                                                                                                                                                                                                                                  |

Rules the table implies, stated explicitly:

- **Owner:** the framework. The logic is two ERR layouts selected by a single `gte(version, "2.5")`, plus two envelope predicates (`gte(version, "2.3.1")` for MSH-9.3, `gte(version, "2.7")` for MSA-3 withdrawal) — three breakpoints, one file, on `@glion/util-semver`, hard-coded — deliberately not `@glion/profiles`-driven (the profiles cannot express the B backward-compat usage of ERR-1/MSA-3 in 2.5–2.6, and the table is closed and normative).
- **Guard:** every comparison is preceded by `valid(version)` — `compare()` throws `VersionParseError` on garbage MSH-12, and the error path must never throw; invalid input falls back to the modern layout (HAPI's blank-version-renders-modern precedent: an empty-ERR-1 modern ERR is at worst ignored by an old reader, whereas ELD sent to a ≥ 2.7 reader targets a withdrawn field).
- **ERR-3 is never empty:** `errorCode` is optional on the exception, so the rendered code is `error.errorCode ?? "207"` (ERR-3 is required from 2.5).
- **Example wire output**, `AckApplicationError` with `errorCode: "204"`, `location: { segment: "PID", sequence: 1, field: 3 }`, `text: "Patient not on file"`: a 2.3.1 sender receives `MSA|AE|<id>|Patient not on file` + `ERR|PID^1^3^204&Patient not on file&HL70357`; a 2.5.1 sender receives `MSA|AE|<id>|Patient not on file` + `ERR||PID^1^3|204^Unknown key identifier^HL70357|E||||Patient not on file`.

### 3. End-user choice is one options object plus two replaceable slots

All policy is configured once — `new Mllp({ acknowledgment })` — plus per-throw data on the exception. No per-exception-type registries, no filter chains (Hono proves one function with branching suffices; CLAUDE.md §1/§5 point the same way).

- **`mode: "original" | "enhanced"`** — the §2.9 family the _framework_ speaks (domain name per CLAUDE.md §7, replacing the Table-0008-leaking `successCode`). `"original"` (default): success AA, unknown AE, unrouted AR. `"enhanced"`: success CA, unknown wrapped as `CommitInternalError` → CE, unrouted → CR — and a thrown application-family exception is **remapped for the immediate reply** (AE→CE, AR→CR), because Table 0008 makes AA/AE/AR illegal as the immediate enhanced-mode response. Honesty note: §2.9.3's commit ack acknowledges safe storage _before_ application processing; in v1, `"enhanced"` selects the commit-family letters for the same post-processing reply (Mirth's `successfulACKCode` shape) — not commit-before-processing semantics; true §2.9.3 sequencing arrives with the deferred application-ACK exchange. A remapped AE→CE also tells the sender "transient, retry" for what may be a permanent failure — which is why the tier mismatch is surfaced to the operator (open question 2). MSH-15/16 are deliberately **not read** in v1 — HAPI's server never reads them either, always-answer is universal MLLP practice, and honouring NE/ER/SU plus the deferred application ACK requires receiver-initiated outbound sending no layer offers; `"auto"` is a reserved future value.
- **`sending`** — MSH-3/4 of every ACK; default: swap of inbound MSH-5/6.
- **`id: () => string`** — MSH-10 generator; default `uid()` from `@glion/util-uid`. One name, one type: `acknowledge()`'s option is also `id?: () => string` (resolved internally), retiring the old `generateId`-vs-`id` inconsistency between the two exports of `@glion/mllp-ack`.
- **`err: "auto" | "none"`** — `"auto"` (default) renders the §2 table; `"none"` emits MSH+MSA only, for legacy partners that choke on ERR (HAPI's only equivalent is all-or-nothing `DO_NOT_RESPOND`; this is strictly better).
- **`text`** — the wire-text policy hook, `(error, ctx) => string | undefined`; returning `undefined` omits MSA-3/ERR-8 entirely (fully conformant — both are optional in every version). Default: §5.
- **`app.notFound(handler)`** — replaces the unrouted default (§4).
- **`app.onError(handler)`** — full override with fall-through (§1).
- **`acknowledgment: false`** — the explicit bare-engine escape: no accept default, no NAK, no notFound; `MessageOutcome` still carries `ctx.error` and `serve()` still reports it. Compose semantics do not change with this flag — the per-level catch is unconditional, so the middleware-facing contract is one thing.
- **Per message** — a handler returning its own Response (or `Root`; see §6/§7) suppresses every default; that is the escape hatch for query responses and exotic replies (Hono's `HTTPException({ res })` / HAPI's `setResponseMessage` shape). A matched handler returning void gets the accept ACK — unlike HTTP, an HL7 accept is fully determined by MSH + policy, so void→accept is the right domain default; the defaulting is attached to the terminal step, where "a handler actually ran" is known.
- **Known limitation, stated deliberately:** a route that must _process and not reply_ (MSH-15=NE partners, broadcast sinks) has no per-route expression in v1 — only the app-wide `acknowledgment: false`; today `onError`-returns-undefined is a sanctioned no-reply, and this design removes that expressiveness. A typed no-reply sentinel is deferred (open question 5).

### 4. Unrouted messages are rejected — never accepted, never silent

When no route matches, `handle()` installs the notFound handler as the terminal step (Hono's dispatch shape; HAPI's `DefaultApplication` substitution). The default throws `UnsupportedMessageTypeReject` through the normal pipeline → AR (CR under enhanced mode) + ERR-3 `200`. This deletes the hand-rolled `app.on("*")` catch-alls from all three examples and fixes HAPI's own wart (its DefaultApplication rejects with 207 because `HL7Exception(String)` never sets a code). The 200-vs-201 refinement (`201` Unsupported event code when the router knows other routes handle this MSH-9.1) is **deferred**: `Router.match` discards pattern strings today (`router.ts` keeps only filter closures), so it would force the router to retain pattern metadata for a distinction no surveyed framework makes and — honest calibration per CLAUDE.md §11 — no known partner branches on; probability a partner distinguishes 200 from 201: effectively zero.

**Garbage payloads:** the lenient parser never throws, so a non-HL7 frame yields a tree with empty MSH-9/10/12. A payload with no readable MSH-9 (`ctx.messageType === ""`) is rejected `AR` + ERR-3 `207` via `new AckApplicationReject(msg, { errorCode: Hl7ErrorCode.ApplicationInternalError, severity: Severity.Error })` — empty MSA-2, modern layout per the blank-version row — rather than a misleading "Unsupported message type". Once #666 lands, decode/parse failures reach the same boundary via `ctx.error` and take over this branch.

**Loop guard:** an inbound message whose MSH-9.1 is `ACK` and matches no route gets **no reply** — an ACK is never itself acknowledged, so two glion nodes cannot NAK each other's ACKs indefinitely.

### 5. Unknown errors: a generic NAK on the wire, the real error to the operator

Wire text follows Koa/http-errors' `expose` asymmetry — the default in three of the four surveyed HTTP frameworks, and Mirth's default:

- A deliberately thrown `AckException` is the 4xx analogue: its author chose its words. The wire gets `error.text ?? labelFor(error.errorCode) ?? Hl7ErrorLabel["207"]`, where `labelFor(code: string | undefined): string | undefined` is a widened Table 0357 lookup exported beside the map (`errorCode` is typed `string | undefined` for inbound tolerance, so a direct index into `Record<Hl7ErrorCode, string>` neither type-checks nor handles peer-supplied non-standard codes) — never `error.message`. One rule, both directions: `text` is the wire-facing field (it is what the client already parses out of a remote MSA-3, `packages/mllp-client/src/ack.ts`), `message` is the operator log line per ADR 0018 §6 and is **never serialized**. This fixes the current asymmetry where the server writes `message` to MSA-3 while the client fills `text` from it — and it makes a gateway that rethrows an upstream NAK forward the upstream's actual wire text.
- Anything else — including non-Error throws, normalized at the boundary — is the 5xx analogue: the wire gets the fixed sentence `"Application internal error"` + ERR-3 `207` + ERR-4 `E`, and nothing more. `error.message`, `String(error)`, stacks, and `cause` never reach the peer; the original error (not the wrapper) rides `ctx.error` and `MessageOutcome.error` to `serve()`'s `onError` — responding never suppresses reporting.

All emitted text passes the encode-escapes serializer exactly once; MSA-3 is truncated to 80 (escape-aware) and ERR-8 to 250. An application that writes PHI into an `AckException.text` has authored a leak the library cannot detect — the JSDoc says so loudly ("this text goes to the trading partner").

### 6. Wire-safety rules where we deliberately deviate from Hono

- **A committed success response is never replaced by a default NAK.** Hono's `isError`-overwrites-finalized rule is wrong for MLLP: when the terminal handler has committed the message and the AA exists, a later throw from an outer middleware (audit write, telemetry EPIPE) must not turn it into an AE — the sender would retransmit and the message would be processed twice, the exact failure the ACK protocol exists to prevent. The commit is a provenance flag set by the terminal step (never raw `ctx.res` truthiness — a pre-`next()` write by a middleware does not count); the late error still sets `ctx.error` and reaches `MessageOutcome.error`, and only an explicit Response returned from `app.onError` may replace a committed reply.
- **The pipeline is once-latched with a floor behind it** (§1) — a throwing `onError` fires once, not once per onion layer, and can never produce silence.
- **`ctx.res` has one shape.** Handlers, middleware, and `onError` may return a `Root` (the project's actual currency — a new `HandlerResponse = Response | Root` type, §7), and `ctx.res` becomes an accessor that normalizes any `Root` to `{ raw }` at write time — one serialization, covering direct `ctx.res = tree` assignments too — so every observer (the CLI's MSA regex included) always reads `{ raw }`. Compose's `"raw" in result` duck-check widens accordingly.
- **Origin MSH fields are snapshotted still-encoded at `createContext`** as `ctx.origin: OriginSnapshot` (alongside the existing `controlId`/`version` caching) and decoded exactly once by the renderer. Reading `ctx.ast` at render time is nondeterministic — `ctx.tree()` decodes that tree in place — which is how `Barnes\T\Jewish` in MSH-4/6 becomes `\E\T\E\` today on every ACK for partners with `&` in facility names. The snapshot makes the ACK byte-identical whether or not a handler called `ctx.tree()`; the `\T\`-facility tests are load-bearing. `acknowledge()` takes the snapshot — not a `Root` — so custom `onError` handlers and gateways get the same deterministic input the default renderer uses instead of re-opening the trap.

### 7. Public API

```ts
// ── @glion/ack — additions only; the exception family stays data-only ──
export interface ErrorLocation {
  segment: string;
  sequence?: number;
  field?: number;
  repetition?: number;
  component?: number;
  subcomponent?: number;
}
export interface AckExceptionOptions extends ErrorOptions {
  errorCode?: string; // Table 0357
  severity?: string; // Table 0516
  /** Wire-facing text, BOTH directions: outbound → MSA-3 (≤2.6) + ERR-8 (2.5+);
   *  inbound ← the remote MSA-3, or ERR-8 when MSA-3 is absent (≥2.7).
   *  `message` is operator-only, never serialized. */
  text?: string;
  controlId?: string;
  location?: ErrorLocation; // NEW → ERR-2 (ERL) in 2.5+, the ELD prefix in ERR-1 before 2.5
}
/** Table 0357 display labels ("207" → "Application internal error"), derived from Hl7ErrorCode. */
export const Hl7ErrorLabel: Readonly<Record<Hl7ErrorCode, string>>;
/** Widened lookup for peer-supplied / absent codes; used by the renderer as
 *  `text ?? labelFor(errorCode) ?? Hl7ErrorLabel["207"]`. */
export function labelFor(code: string | undefined): string | undefined;
/** Symbol.for("glion.ack.exception") brand set in the AckException constructor — survives
 *  duplicated package copies where instanceof degrades silently to AE/207. */
export function isAckException(error: unknown): error is AckException;

// ── @glion/mllp ──
export interface AcknowledgmentOptions {
  mode?: "original" | "enhanced"; // §2.9 family; "auto" reserved
  sending?: { application: string; facility: string }; // MSH-3/4; default: swap inbound MSH-5/6
  id?: () => string; // MSH-10 generator; default uid(). Same name+type on AcknowledgeOptions.
  err?: "auto" | "none"; // "none": MSH+MSA only
  text?: (error: AckException, ctx: Context) => string | undefined;
}
/** Still-encoded origin MSH values captured at createContext (MSH-3/4/5/6/9/10/11/12). */
export interface OriginSnapshot {
  /* readonly wire-encoded fields */
}
export interface MessageOutcome {
  readonly response: Response | undefined;
  readonly error: Error | undefined; // reported by serve() via its onError
  readonly info: MessageInfo;
}
/** A handler/middleware/onError may return a Response or a Root; a Root is
 *  serialized once when written to ctx.res. */
export type HandlerResponse = Response | Root;
export class Mllp {
  constructor(options?: { acknowledgment?: AcknowledgmentOptions | false });
  parser(processor: Hl7v2Processor): this;
  use(middleware: Middleware, options?: { prepend?: boolean }): this; // prepend: ordering preference, never correctness
  use(patternOrFilter: string | RouteFilter, middleware: Middleware): this;
  on(patternOrFilter: string | RouteFilter, handler: Handler): this;
  notFound(handler: Handler): this; // NEW — default: AR/CR + ERR-3 200 (207 when MSH-9 unreadable)
  onError(handler: ErrorHandler): this; // undefined return = fall through to default
  // NOTE: shown pre-#666; after rebasing on #666 the signature is
  // handle(payload: Uint8Array, connection: ConnectionInfo): Promise<MessageOutcome> —
  // the envelope, not the parameter list, is what this ADR fixes.
  handle(
    raw: string,
    bytes: Uint8Array,
    connection: ConnectionInfo
  ): Promise<MessageOutcome>;
}
// Handler / Middleware / ErrorHandler return types widen to HandlerResponse | undefined | void.
export interface Context {
  /* …all existing fields unchanged… */
  /** Set at the throwing layer; read after `await next()`, which no longer throws.
   *  The same field #666 sets for decode/parse failures. */
  error: Error | undefined;
  /** Deterministic renderer input; see §6. */
  readonly origin: OriginSnapshot;
  /** Becomes an accessor: assigning a Root serializes it once to { raw }. */
  res: Response | undefined; // set res(value: Root | Response | undefined)
}
/** Moved from @glion/mllp-ack; used by the defaults, exported for custom onError handlers,
 *  gateways, and tests. Takes the snapshot, not a Root, for determinism (§6). */
export function acknowledge(
  origin: OriginSnapshot,
  options?: AcknowledgeOptions
): Root;
```

Removed from the public surface: `getMessageInfo` (the WeakMap side-channel it fronted is retired by `MessageOutcome`) — a break for out-of-repo transports independent of `handle()`'s return type, called out in its own changeset line.

### 8. `@glion/mllp-ack` is deleted; `@glion/ack` stays vocabulary-only

`@glion/mllp-ack` does not survive: its only structural role is occupying a middleware slot, and that slot is the source of every ordering bug. `acknowledge()` (whose MSH swap / MSA mapping is the spec-correct part worth preserving verbatim, per the conformance review — pinned by its 349-line `acknowledge.test.ts`) returns inside `packages/mllp/src/server/acknowledgment/` beside the new renderer and floor, with those test pins ported onto it. The mllp README's decoupling argument is already half-false — the core imports `@glion/util-query`/`@glion/ast` to _read_ HL7v2 for routing — and the new deps (`@glion/ack`, `@glion/builder`, `@glion/to-hl7v2`, `@glion/encode-escapes`, `@glion/util-uid`, `@glion/util-timestamp`, `@glion/util-semver`) are small, profile-free, and already transitive in every real deployment. Hono ships `HTTPException` and its default `errorHandler` inside core for the same reason: an error boundary that can be absent or mispositioned is not a boundary. `@glion/ack` keeps its ADR 0018 role — version-agnostic, bidirectional, data-only — gaining exactly the words in §7 and dropping its unused `@glion/ast` dependency.

### 9. Build it now — a stacked series with removal as the baseline, this ADR landing with the baseline

The maintainer asked: remove now and write the ADR, or is the design straightforward enough to build now? **Build now, stacked, with removal first.** The design is straightforward in the CLAUDE.md §12 sense: five verified research lenses converge on one architecture, and every input exists in the repo. Remove-and-_stop_ would be strictly worse than the status quo — it makes silence the default for forgotten wiring and unrouted messages, contradicting ADR 0011's recorded default-NAK decision and PR #666's floor — so the removal is acceptable only as the first PR of this stack, merged together with its replacements.

Landing plan, stacked on PR #674:

- **PR 1 — the baseline (this ADR's PR): delete `@glion/mllp-ack`.** The package, its pending changeset, and every workspace reference to it are removed; `@glion/ack` is untouched. No replacement is introduced — the baseline is the smallest coherent state to build on. Examples still compile against the published npm package and migrate in the final PR, where their replacement pattern exists.
- **PR 2 — the renderer and the vocabulary (non-breaking).** `@glion/ack` gains `location`, `Hl7ErrorLabel`/`labelFor`, and `isAckException`; `@glion/mllp` gains `packages/mllp/src/server/acknowledgment/` — `OriginSnapshot`, `acknowledge()` (restored from mllp-ack with its spec pins ported), and the version-keyed renderer — exported but not yet wired, with the exact-wire-string test matrix ({2.1, 2.3.1, 2.4, 2.5.1, 2.6, 2.7, blank/garbage MSH-12} × {accept, `AckException` with code+location, unknown Error}).
- **PR 3 — the boundary (breaking, pre-1.0 with loud changesets).** Compose catch + `ctx.error`, `Mllp` acknowledgment options / `notFound` / `MessageOutcome`, the client-side ERR-2/ERR-8 reads that close the round trip, the core's own compose/mllp/prepend test rewrites, examples, CLI, and the `@glion/mllp` README rewrite.

Across the stack: roughly 30–35 files, ~+900/−1,300 LOC, three to four focused days including the conformance matrix and the client round-trip tests.

## Consequences

- **One error path, two audiences.** Every throw — middleware, handler, and (post-#666) decode/parse — reaches one boundary; the peer gets a version-correct NAK, the operator gets the real error via `MessageOutcome.error` → `serve.onError`. Neither can starve the other again.
- **Wire-visible behaviour flips** (corrections, but partners will observe them; loud changesets required): unrouted AA → AR + ERR 200 (207 for unreadable MSH-9); unknown-error silence-or-leak → generic AE/207 NAK; NAKs now carry ERR by default; MSH-9.3 `ACK` appears from 2.3.1; MSA-3 disappears at ≥ 2.7.
- **`next()` never throws.** Existing try/catch-around-`next()` observers (the documented idiom in `examples/mllp-server/src/app.ts`) silently stop seeing exceptions until migrated to read `ctx.error` — the one silent-migration hazard; it gets a dedicated changeset callout, and all in-repo consumers migrate in PR B.
- **`handle()` returns `MessageOutcome`, and `getMessageInfo` is removed** — both breaking for any out-of-repo custom transport; acceptable pre-1.0, each named in the changeset, and together they retire the `errorMessageInfo` WeakMap.
- **The `prepend` coupling dies as a correctness requirement.** The `use(mw, { prepend })` overload survives as an ordering preference; `packages/glion/src/child/middlewares.ts`'s MUST-be-prepended block is deleted because its reason is deleted, `runner.ts` keeps prepend for timing only with its comment rewritten; telemetry reads `ctx.error`/`ctx.res` at any position and its `msg` event gains the error name; `parseAckCode` widens to all six Table 0008 codes.
- **The glion→glion round trip closes — both halves.** Server-side, `errorCode`/`severity`/`location` now render into ERR-3/ERR-4/ERR-2; client-side, `packages/mllp-client/src/ack.ts` (today reading only ERR-3/ERR-4/MSA-3) learns to read ERR-2 into `location` and to fall back to ERR-8 for `text` when MSA-3 is absent (≥ 2.7) — without the client half, the ADR 0018 §3 promise would still be broken.
- **Recorded reversals.** This ADR reverses PR #674's "no package ever emits ERR" (the framework renderer emits it; applications still never hand-assemble it), retires `packages/mllp/README.md`'s "no response … is valid MLLP behaviour" and "Why no default error response?" sections, amends ADR 0018 §3 (the `toErrSegment()` reference is stale; `text` semantics unified), and supersedes ADR 0011's middleware-first sketch while restoring its default-NAK decision — minus that decision's "and the error message" clause, which §5 supersedes.
- **Deferred, all additive on this shape:** `mode: "auto"` from MSH-15/16 and the deferred application-ACK exchange (needs receiver-initiated outbound sending); MSH-15=NE reply suppression and a typed per-route no-reply sentinel (§3's stated v1 limitation); the 200-vs-201 unrouted refinement (needs router pattern metadata); ERR-5 application code and ERR-7 diagnostic fields on the vocabulary; per-partner scoped policies; removal of `serve.ts`'s `console.error` fallback (a standing §8 blemish this ADR shrinks but does not fix).

## Alternatives considered

- **Keep `ackMiddleware` and patch it.** Rejected: the defects are positional, not parametric. A middleware boundary is optional and movable by construction — no option fixes registration-order dependence, the unrouted-AA conflation, or the operator starvation, and no surveyed framework (Hono, Koa, Fastify, Nest, HAPI) puts error translation in an ordinary middleware while also having a global handler.
- **Self-rendering exception (`AckException.getResponse()`, the literal Hono transplant).** Rejected: rendering needs the origin MSH, `ctx.version`, and app policy — none of which a bidirectional, version-agnostic exception may carry (ADR 0018 §3). HAPI hangs `populateResponse` on the exception but still keys it on the _response's_ version; the honest equivalent here is a framework renderer receiving `(error, ctx, options)`.
- **The `errSegment` application callback (status quo escape hatch).** Rejected: it pushes a closed normative table onto every application while withholding the one input the job needs (`ctx.version`), and zero consumers supply it — the observable result is that no NAK carries a coded error at all.
- **Remove now, deliberate later (the minimalist option the maintainer floated).** Rejected _as an end state_ — though its subtraction is adopted as the stack's PR 1 baseline (§9). Stopping there ships the one state no surveyed framework ships: a slot with no default behind it. A forgotten `onError` means wire silence for every error; void-returning success handlers (the documented pattern in all three examples) regress to silence; the PHI policy moves into copy-pasted app code where one cargo-culted line re-opens the leak; and it contradicts ADR 0011's recorded AE-NAK default. Every week of open-ended deliberation would ship today's defects — which is why the replacement PRs land as a stack, not a promise.
- **Keep `@glion/mllp-ack` as a renderer-only package with the dependency flipped (core depends on it).** Rejected: workable, but the boundary no longer pays — same transitive weight, one more seam, and the starter would import policy types from one package and configure them on another. `acknowledge()` and the renderer stay exported from `@glion/mllp` for standalone use, which was the residual value of the package.
- **Drive the renderer from `@glion/profiles`.** Rejected: the profiles cannot express the B backward-compat usage of ERR-1/MSA-3 in 2.5–2.6, and three `gte` breakpoints need no dependency for a closed table.
- **Per-exception-type registries, filter chains, or scoped per-route policy objects.** Rejected/deferred: one `(err, ctx)` function with branching plus one options object is what Hono and the survey prove sufficient (CLAUDE.md §1/§5); scoped policies return if a mixed-partner consumer materialises.
- **Reading MSH-15/16 for per-message mode in v1.** Deferred, not rejected: correct enhanced mode requires the deferred application-ACK exchange, which needs receiver-initiated outbound sending no layer offers; HAPI never reads MSH-15/16 either. `"auto"` is reserved so the future change is additive.

## Related

- [ADR 0011: MLLP Transport & Server](./0011-mllp-transport-server.md) — middleware-first NAK sections superseded; its default-NAK decision restored, its "and the error message" text policy superseded by §5
- [ADR 0013: MLLP Lazy Pipeline Execution](./0013-mllp-lazy-pipeline-execution.md)
- [ADR 0018: Errors, Exceptions, and Acknowledgments in the HL7v2 Ecosystem](./0018-error-and-acknowledgment-model.md) — §3 amended by this ADR
- PR #674 (`feat/ack-language`) — the vocabulary/response split this ADR builds on
- PR #666 (`feat/mllp-pipeline-errors`) — the never-silent direction this ADR subsumes; its decode/parse failures route to the same boundary with no synthetic chain step, and its `handle(payload, connection)` signature and `ctx.error` field carry forward
- PR #664 (`lint-charset` + server `charsetMiddleware`) — orthogonal: `charsetMiddleware` is an ordinary middleware and composes with the new boundary unchanged
