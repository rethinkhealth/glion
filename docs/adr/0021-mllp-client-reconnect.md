# ADR 0021: MLLP Client — Terminality Belongs to the Connection, Not the Client

## Status

Accepted (2026-09-10)

Withdraws ADR 0020, whose mailbox-actor design was built, measured, and rejected on 2026-09-07 (`docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` §0). The shipped client is its own record: `packages/mllp-client/src/`.

## Context

`@glion/mllp-client` is lockstep: one message on the wire, one acknowledgment back, correlated by MSH-10 ↔ MSA-2. After a lost connection, an unreadable reply, a reply answering another message, or a send that timed out, the client cannot tell which reply answers which message, so it stops rather than guess.

Until #714 that argument closed the client. Every wire failure was terminal, and the only way forward was a new `MllpClient`, which put the reconnect loop in every integrator's code. What the argument establishes is that the **connection** is finished, not the client.

## Decision

1. **A wire failure ends the connection; the client dials again.** `CONNECTION_LOST`, `SEND_TIMEOUT`, and `INVALID_RESPONSE` still end the connection. The client then enters `reconnecting` and dials under a `reconnect` policy: `attempts` (default 5) and `delay(attempt, error)` (default full-jitter exponential backoff from 200 ms, capped at 2 s; `null` stops). The policy applies to the first connection too: a refused first dial is retried the same way. `reconnect: false` restores a terminal client. The attempt counter starts over each time a connection opens.

2. **A message in flight when the connection ends is never sent again by the client.** Its `send()` rejects with the failure. Whether the receiver has the message is unknown to the client and known, at best, to the caller. Reconnect restores the link, not the message.

3. **Waiters wait; owners win.** `send()` and `connect()` arriving during `reconnecting` wait for the outcome, as they do during `connecting`. `close()` and `destroy()` stop a reconnect at once. When the policy gives up, the client closes with the last failure: waiters receive it, and later calls receive `MllpClientClosedError` with it on `cause`.

4. **Every attempt is observable.** `disconnect(error)` fires once per lost connection, `reconnecting(attempt, delayMs)` once per attempt before the wait, then `connect` or `close`.

5. **Message retry is a separate policy, off by default.** Resending after a NAK, after a failure before anything was written, or after a failure of unknown delivery is a per-message decision that depends on the receiver's deduplication, so it is a per-send, opt-in option, designed in `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md` §2 and tracked in its own issue. It is never on by default: a duplicated clinical message is a safety event.

## Consequences

- A long-lived client survives a network blip on its own. The error texts and README no longer say "construct a new MllpClient".
- `disconnect` no longer implies `close`. Code that treated the two as one event must listen for `close`.
- The default policy is bounded, so a client whose peer is gone for good closes after a few seconds and releases its timer; an unbounded policy is `attempts: Infinity` with a `delay` that never returns `null`.
- An idle drop is still noticed only by the next `send()` (#690). Until that lands, the send that discovers the drop fails, and the one after it goes out on the new connection.

## Alternatives considered

- **Reconnect only after a connection has opened once**, so a wrong host fails in one connect timeout. Rejected: a daemon that starts before its receiver is the common case, and the bounded default keeps a wrong host cheap.
- **Unbounded attempts by default**, as ioredis and interface engines do. Rejected: a referenced timer keeps a Node process alive forever after the peer is decommissioned, and `unref` is not portable across runtimes.
- **`retry` as the option name** (the issue's proposal). Rejected: reserved for message retry, which has the opposite safety profile.
- **Resending the lost message when the write itself rejected**, on the grounds that nothing reached the wire. Rejected: a write can succeed locally and fail on the wire, so "the write rejected" is not "not delivered".

## Related

- Issues #714 (this decision), #690 (idle drop detection), #646 (idempotency and retry)
- ADR 0018 (error model), ADR 0019 (acknowledgment translation)
- `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md`
