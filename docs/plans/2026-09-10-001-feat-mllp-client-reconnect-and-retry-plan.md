# @glion/mllp-client — reconnect (#714) and the message-retry boundary

**Date**: 2026-09-10
**Status**: Decided 2026-09-10 (see §5); reconnect implemented in the same change
**Scope**: Issue #714 (reconnect after a lost connection), and the question it raises: whether the client should resend a message the receiver answered with a NAK, and where that policy belongs. Builds on the shipped #692 client and on `docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` (T0-2 reconnect, T1-1 idle drop, T1-4 retry policy).

## 0. Where the code is today

- Phase graph (`src/client/state.ts`): `idle → connecting → connected ⇄ sending → closing → closed`, and every wire failure → `closed`. `#connection` is documented as "the one connection this client ever makes".
- `#close(from, reason)` is the only exit. `#fail` reaches it for `CONNECT_FAILED` / `CONNECT_TIMEOUT` (from `connecting`), for `CONNECTION_LOST` / `SEND_TIMEOUT` / `INVALID_RESPONSE` (from `sending`), and `destroy()` reaches it from any phase.
- A NAK keeps the connection open; `send()` throws the `@glion/ack` exception (ADR 0018 §5).
- Events (`src/client/events.ts`): `connect`, `disconnect(error | null)`, `close`. The issue says `reconnecting(attempt, delayMs)` is declared and never emitted; in the shipped #692 it is not declared at all. This work adds it.
- No idle drop detection (#690). The client only touches the socket inside `send()`; a peer that hangs up while the client is idle is noticed by the next `send()`, which fails `CONNECTION_LOST`.
- Text that assumes a terminal client: `MllpSendTimeoutError` ("Construct a new MllpClient to send again"), `MllpClientClosedError` (same, plus "A closed client never reconnects"), the `MllpClient` JSDoc, README `client.state` ("A client closes once and does not reconnect"), README `CLOSED`, and the FAQ.
- 16 tests in `test/client/client.test.ts` assert `state === "closed"` after a failure.
- Consumers: `glion send` (`connect()`, one `send()`, `close()` in `finally`) and the benchmarks.

## 1. Reconnect (#714)

### 1.1 Semantics

Terminality moves from the client to the connection. A connection still ends on `CONNECTION_LOST`, `SEND_TIMEOUT`, `INVALID_RESPONSE`, and, once #690 lands, on an idle drop. What changes is what follows: instead of `closed`, the client enters `reconnecting` and dials again after a delay.

What does not change:

- **A message in flight when the connection dies is never retried by the client.** Its `send()` rejects exactly as today. Reconnect restores the link, not the message.
- Lockstep. One send at a time; `ALREADY_SENDING` is unchanged.
- `close()` and `destroy()` win. From `reconnecting` they cancel the wait, or the dial in flight, at once, and the client is `closed`.

### 1.2 Decisions to confirm

**D1 — On by default.** Recommend **on**, bounded (D4). "Silently terminal" is the surprising default for a healthcare interface client, and it is what ioredis and the MongoDB driver do. The production-readiness plan (T0-2) recommends the same. Cost: `disconnect` no longer implies `close`, which is a behaviour change for anyone relying on it; 16 tests need `reconnect: false` or new expectations. `glion send` is unaffected: it closes in `finally`, and D2 keeps its connect failure fast.

**D2 — Only after a connection has opened?** Recommended fail-fast on the first `connect()`; **overruled**: the policy applies to the first dial too, since a daemon starting before its receiver is the common case and the bounded default keeps a wrong host cheap (a few seconds).

**D3 — Option name and shape.** The issue proposes `retry?: { attempts?, delay? }`. Recommend **`reconnect`**, because §2 reserves `retry` for the message, and CLAUDE.md §7 wants the name to say what the caller is asking for.

```ts
interface MllpClientOptions {
  /**
   * How the client reconnects after a lost connection. `false` makes a lost
   * connection close the client.
   */
  readonly reconnect?: MllpReconnectOptions | false;
}

interface MllpReconnectOptions {
  /** Consecutive failed attempts before the client closes for good. Default 10. */
  readonly attempts?: number;
  /**
   * Time to wait before `attempt` (1-based), in milliseconds, or `null` to
   * stop. `error` is what ended the connection, or the previous attempt's
   * failure. Default: full-jitter exponential backoff, 200 ms base, 30 s cap.
   */
  readonly delay?: (attempt: number, error: MllpClientError) => number | null;
}
```

`delay` receives the error so a policy can tell `ECONNREFUSED` from a timeout; ioredis's `retryStrategy(times)` has no error and needs a second hook (`reconnectOnError`) for that. Cheap to add now, breaking to add later. The attempt counter resets when a connection opens.

**D4 — Bounded default.** Unbounded (ioredis, Mirth) or bounded? Recommend **bounded**; settled at 5 attempts with full-jitter backoff from 200 ms capped at 2 s, so the default gives up within a few seconds. An unbounded loop holds a referenced timer and keeps a Node process alive forever after the peer is decommissioned, and `unref` is not portable across runtimes. `delay` returning `null` is the escape hatch either way, and `reconnecting` gives an operator the signal to act on.

**D5 — `send()` and `connect()` during `reconnecting` wait**, as they do during `connecting` today. If reconnect gives up, they reject with `MllpClientClosedError` carrying the last dial failure as `cause`. Waiting is what makes acceptance #1 ("the next `send()` succeeds") true, and the wait is bounded by the reconnect policy. The send timeout does not run while waiting; it starts at the write, as today. Alternative, not recommended: reject at once with a new `NOT_CONNECTED`-class error.

**D6 — Record it in a new ADR 0021** and withdraw ADR 0020, which describes the unshipped actor. Done: `docs/adr/0021-mllp-client-reconnect.md`; ADR 0020 and its two companion documents are deleted.

### 1.3 Phase graph

```
idle → connecting → connected ⇄ sending → closing → closed
                        ↑            │
                        └── reconnecting ←┘      lost from connected or sending; never from closing
                                 │
                                 └──→ closed     attempts exhausted · delay() → null · close() · destroy()
```

- New state: `{ phase: "reconnecting"; attempt: number; ready: Promise<void>; abort: AbortController }`. `ready` never rejects, because nobody may be awaiting it when the loop gives up; waiters re-read the phase after it resolves, the same way `send()` re-asserts after `connect()`.
- `MllpClientState` gains `"reconnecting"`. `connected` is `false` there. The whole loop, wait and dial, is `reconnecting`; `connecting` stays the initial phase only.
- Events after a drop, in order: `disconnect(error)` once per lost connection, `reconnecting(attempt, delayMs)` once per attempt with the delay actually waited, then `connect` on success or `close` on giving up.

### 1.4 Changes

| Where                        | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/client/state.ts`        | The `reconnecting` phase.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/client/events.ts`       | `reconnecting(attempt: number, delayMs: number): void`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/types.ts`               | `MllpReconnectOptions`, `reconnect` on `MllpClientOptions`, `"reconnecting"` in `MllpClientState`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/constants.ts`           | `DEFAULT_RECONNECT_ATTEMPTS`, backoff base and cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/client/assertions.ts`   | `assertReadyToConnect` and `assertReadyToSend` gain the `reconnecting` arm; `assertTimeoutMs`-style validation for `attempts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/client/client.ts`       | `#fail` forks: from `connected` or `sending` with reconnect enabled → `#reconnect(reason)`; otherwise `#close` as today. `#reconnect` loops: policy → emit → abortable sleep → `#open()` → `connected` + `connect`; a dial failure feeds the next attempt; an abort returns because `close()` already moved the phase; giving up calls `#close(from, lastError)`. `#open()` is shared with `connect()`. `#close` from `reconnecting` aborts the controller, destroys a dial in flight, emits `close` only (`disconnect` already fired). One local abortable `sleep(ms, signal)`; no `Deadline` class (CLAUDE.md §1). |
| `src/errors/*`               | `MllpClientClosedError` takes an optional `cause`; reword it and `MllpSendTimeoutError`. Tests assert message strings (ADR 0018 §6), so those tests change too.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `README.md`                  | State table, events table, options, `CLOSED` / `SEND_TIMEOUT` / `CONNECTION_LOST` entries, the FAQ ("closes the connection, not the client").                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/client/client.test.ts` | Drop during a send: the send rejects, the client reconnects, the next send succeeds. Idle drop (needs §3). `reconnecting` fires per attempt with the delay waited. Stops at `attempts`. Stops when `delay` returns `null`. `close()` during the wait. `destroy()` during a dial. `reconnect: false` keeps today's behaviour. Counter resets after a successful reconnect. `connect()` and `send()` during `reconnecting` wait. Listener order.                                                                                                                                                                       |
| `test/node.test.ts`          | `nodeSocket.connect` is called again after `close()`; the contract "called again only after `close()`" already holds, so no adapter change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `.changeset`                 | Minor with a behaviour-change note (D1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `docs/adr/0021-*.md`         | D6.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 2. Message retry: should the client resend after a NAK?

### 2.1 What a NAK means for a resend

A failed send has one of three delivery outcomes. The resend risk differs in kind, not degree:

| Outcome  | Errors                                                      | Processed by the receiver?             | Resend risk                                                                                                                                |
| -------- | ----------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Not sent | `CONNECT_FAILED`, `CONNECT_TIMEOUT`, `CLOSED` while waiting | No                                     | None. (`INVALID_MESSAGE`, `INVALID_OPTION`, `ALREADY_SENDING` are also not-sent but permanent for the same input; resending is pointless.) |
| Unknown  | `CONNECTION_LOST`, `SEND_TIMEOUT`, `INVALID_RESPONSE`       | Maybe                                  | A duplicated clinical event.                                                                                                               |
| Refused  | `AckException` (`AE`, `AR`, `CE`, `CR`)                     | No. The receiver answered and refused. | None from duplication.                                                                                                                     |

So a NAK is the one failure where resending is duplicate-safe by construction, and the transport case is its mirror: resending after a NAK is safe but usually useless, resending after unknown delivery is often useful but unsafe. That is the "opposite retry semantics" ADR 0018 names.

Whether a resend is useful depends on why the receiver refused, and **MSA-1 alone does not say**:

| Signal         | Meaning                                                                                                                                                                                                                                           | Resend?                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `CE`           | Commit error: "cannot be accepted for any other reason" (§2.9.3). The storage or infrastructure failure code.                                                                                                                                     | Yes.                                            |
| `CR`           | Commit reject: MSH-9, MSH-11, or MSH-12 not acceptable.                                                                                                                                                                                           | No.                                             |
| `AE`           | Application error. Usually content (ERR-3 `100`–`103`, `204`): permanent. But HAPI, and glion's own `ApplicationInternalError`, answer `AE` + ERR-3 `207` for an unexpected exception, which is transient.                                        | Only with ERR-3 `206` or `207`.                 |
| `AR`           | Application reject. The spec puts both "MSH-9/11/12 not acceptable" (ERR-3 `200`–`203`, permanent) and "cannot be processed for reasons unrelated to content or format: system down, internal error" (resend later) under this one code (§2.9.2). | Only with ERR-3 `206` or `207`.                 |
| ERR-3 `205`    | Duplicate key: the receiver already has this message. A previous attempt landed and its acknowledgment was lost.                                                                                                                                  | Never. The caller should treat it as delivered. |
| ERR-3 `206`    | Record locked.                                                                                                                                                                                                                                    | Yes.                                            |
| No ERR segment | Mirth's default NAK is `MSA\|AE\|id\|text` with no ERR.                                                                                                                                                                                           | No. Unknown is not transient.                   |

Two caveats that argue for a bounded, off-by-default policy: ADR 0019 records that glion's own server in enhanced mode remaps `AE → CE` for the immediate reply, so "`CE` is transient" is not reliable against every receiver; and receivers vary far more than HTTP servers do, so any built-in table will be wrong for some peer and must be overridable.

### 2.2 Where the policy belongs

How mainstream clients treat a server-side refusal:

- **ioredis** retries commands lost to a disconnect (offline queue, `maxRetriesPerRequest`) and never retries a Redis error reply. A Redis error is the closest analogue to a NAK.
- **MongoDB** retryable writes: exactly one retry, only when the server labels the error `RetryableWriteError`, and only because a transaction number makes the retry idempotent server-side.
- **kafkajs** retries broker errors whose error-code table says `retriable`, with backoff.
- **undici** `RetryHandler`: opt-in; retries listed status codes (429, 5xx) and error codes, idempotent methods only, honours `Retry-After`.
- **AWS SDK**: `maxAttempts` for throttling and transient errors; idempotency tokens for non-idempotent operations.

The shared shape: retry on a **server-labelled** transient failure is normal; it is bounded, opt-in or conservatively defaulted, and never crosses an idempotency line the server has not guaranteed. In HL7v2 the label is the pair (MSA-1, ERR-3), and the idempotency guarantee is the receiver's MSH-10 deduplication, which the client cannot know about.

### 2.3 Recommendation

**R1 — Reconnect ships alone in #714.** No message retry of any kind in that change; that is the issue's own invariant.

**R2 — One retry surface, per send, off by default.** Idempotency is a fact about a message and its receiver, not about a client, so the option lives on `MllpSendOptions`, not on the constructor, and not in a sibling package (a helper the caller could write in fifteen lines is not a package). It covers all three outcomes with one predicate:

```ts
interface MllpSendOptions {
  readonly timeoutMs?: number;
  readonly retry?: MllpRetryOptions;
}

interface MllpRetryOptions {
  /** Resends after the first attempt. Default 0. */
  readonly attempts?: number;
  /** Time to wait before resend `attempt` (1-based), in ms, or `null` to stop. */
  readonly delay?: (
    attempt: number,
    error: MllpClientError | AckException
  ) => number | null;
  /**
   * Which failures to resend after. Default: a NAK the receiver marked as one
   * to resend later (§2.1), and a failure before anything was written. Never a
   * failure whose delivery is unknown.
   */
  readonly when?: (error: MllpClientError | AckException) => boolean;
}
```

- Same MSH-10 and the same bytes on every attempt: the message is encoded once. The client never generates MSH-10 (#646, production-readiness plan §5).
- A caller whose receiver deduplicates by MSH-10 opts into unknown-delivery retries per send with `when: () => true`. That is the T1-4 shape: `unknown` requires an explicit per-send opt-in.
- Inside the client, `#send` loops. A resend after a NAK reuses the open connection. A resend after a not-sent failure awaits the reconnect through the same path a fresh `send()` does (D5). The wait uses the §1 abortable sleep. The phase stays `sending` across attempts, so `ALREADY_SENDING` holds. `close()` lets the attempt in flight finish and stops further attempts; `destroy()` cuts the wait.

**R3 — The classification is vocabulary and ships in `@glion/ack`**, next to `isAckNakCode`: a guard over (MSA-1, ERR-3) saying whether the receiver marked the refusal as one to resend later. Server authors read the same table to choose what to emit, which keeps both ends of the wire in one vocabulary (ADR 0018 §3). Naming is open: HL7v2 has no word for it ("resend" in §2.9.2 is the nearest), and "transient" or "retryable" are not HL7 words.

**R4 — Sequencing.** Retry lands after reconnect, as its own PR, with the README "Idempotency and retries" section #646 asks for, and ADR 0021 §2.

**R5 — Not doing.** Auto-generated MSH-10; retry on by default; a retry package; a `sendNoThrow` variant.

## 3. #690 and acceptance #1

Acceptance #1 reads: a client whose connection is lost while idle reconnects and the next `send()` succeeds. Without idle drop detection, the drop is discovered by that next `send()`, which rejects `CONNECTION_LOST`; the reconnect then starts, and the send after that succeeds. That is the honest outcome of #714 alone. With #690, the drop is seen at once, the client is already `reconnecting` or connected again when the send arrives, and the acceptance holds as written.

A #690 shape that fits the lockstep design without an adapter change: **keep one read outstanding on the connection at all times.** After `ready`, and after each exchange consumes its reply, the connection parks `reader.read()`; `exchange` writes and then awaits the parked read instead of starting one. While idle, that read settling means one of two things: `done`, the peer closed, and the connection reports itself lost; or a value, an unsolicited frame (a late acknowledgment, or a peer that does not lockstep), which is an `INVALID_RESPONSE`-class failure that ends the connection. `MllpConnection` gains `closed: Promise<MllpClientError>`; the client wires it on open to the same path a send failure takes. Roughly 25 lines in `connection.ts` and 10 in `client.ts`. With `Duplex.toWeb`, an outstanding read keeps the Node socket flowing, so a FIN or a keepalive failure settles it; the in-memory stub already models both (`hangsUp()`).

Recommend landing #690 first, in its own PR, so #714's headline test is real. #714 does not block on it.

## 4. Sequencing

| Step | PR                                                                                                         | Depends on                    |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | #690 idle drop: outstanding read, `closed` on the connection, client wiring, tests                         | —                             |
| 2    | #714 reconnect: §1.4, changeset, ADR 0021 §1                                                               | 1 (recommended, not required) |
| 3    | Message retry: `send({ retry })`, `@glion/ack` guard, README idempotency section, ADR 0021 §2, closes #646 | 2                             |
| 4    | #717 ADR 0020 rewrite                                                                                      | separate                      |

## 5. Decisions (maintainer, 2026-09-10)

- D1 on by default. D2 the policy covers the first connection too (recommendation overruled). D3 `reconnect`, with `delay(attempt)`: the error parameter proposed above, and the separate `reconnecting` phase of §1.3, were both dropped for simplicity; a lost connection returns the client to `connecting`. D4 revisited 2026-09-11 against peer defaults: full-jitter backoff 1 s → 30 s cap, 5 attempts (about 30 s in all; unlimited was tried and rejected because a `send()` against a down host would never settle), the default function living in `reconnect.ts`. D5 waiters wait; `CLOSED` carries `cause`. D6 ADR 0021; ADR 0020 withdrawn.
- R1–R5: message retry, NAK-triggered or otherwise, is separate work; the maintainer files its own issue, with §2 as the design.
- Step 1 (#690) was not ordered first; #714 shipped without it, so an idle drop is still discovered by the next `send()`.

## Related

- Issues #714, #690, #646, #717, #715
- ADR 0018 (§3 shared ACK vocabulary, §5 throw-on-NAK), ADR 0019 (enhanced-mode remap), ADR 0020
- `docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` (T0-2, T1-1, T1-4, §5)
