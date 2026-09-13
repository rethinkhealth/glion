# ADR 0021: MLLP Client — Connection Attempts Are Retried; a Lost Connection Closes the Client

## Status

Accepted (2026-09-10; revised 2026-09-12, see the last alternative)

Withdraws ADR 0020, whose mailbox-actor design was built, measured, and rejected on 2026-09-07 (`docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` §0). The shipped client is its own record: `packages/mllp-client/src/` (`client.ts`, `session.ts`, `state.ts`, `reconnect.ts`) and `packages/mllp-client/src/errors/`.

## Context

`@glion/mllp-client` is lockstep: one message on the wire, one acknowledgment back, correlated by MSH-10 ↔ MSA-2. After a lost connection, an unreadable reply, a reply answering another message, or a send that timed out, the client cannot tell which reply answers which message, so it stops rather than guess.

That argument closes the client: the connection it held is finished, and the message's delivery is unknown. What it says nothing about is the dialing. Before #714 a refused first dial was terminal too, so a daemon that started before its receiver failed at once, and every integrator wrote the same retry loop around `connect()`.

## Decision

1. **Dialing is retried; a lost connection is terminal.** A connection that cannot be opened is dialed again under a `reconnect` policy: `attempts` (default 5, so the client gives up about 30 seconds after the first failure) and `delay(attempt)` (default full-jitter exponential backoff from 1 s, capped at 30 s). `attempts` is the only way the policy stops; `reconnect: false` dials once. The dialing is one promise held by the `connecting` phase, so every `send()` or `connect()` waiting on it shares its outcome, and `close()` aborts it. `CONNECTION_LOST`, `SEND_TIMEOUT`, and `INVALID_RESPONSE` close the client with that error, as they did before #714. A client is as disposable as a socket: the application constructs a new one, and owns whether and when to.

2. **A message in flight when the connection ends is never sent again by the client.** Its `send()` rejects with the failure. Whether the receiver has the message is unknown to the client and known, at best, to the caller. Reconnect restores the link, not the message.

3. **Waiters wait; owners win.** `send()` and `connect()` arriving while the client is `connecting` wait for the outcome. `close()` and `destroy()` stop the dialing at once. When the policy gives up, the client closes with the last failure: waiters receive it, and later calls receive `MllpClientClosedError` with it on `cause`.

4. **The events are facts about the client.** `connect` fires when the connection opens; `close(error | null)` fires once when the client is done, with the failure it closed on or `null` when the owner closed it. There is no event for an attempt in progress: `delay(attempt)` is already called once per attempt, and is the hook for logging them. Per-attempt events are deferred.

5. **Message retry is a separate policy, off by default.** Resending after a NAK, after a failure before anything was written, or after a failure of unknown delivery is a per-message decision that depends on the receiver's deduplication, so it is a per-send, opt-in option, designed in `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md` §2 and tracked in its own issue. It is never on by default: a duplicated clinical message is a safety event.

## Consequences

- A daemon that starts before its receiver, or whose receiver restarts while it is connecting, connects on its own once the receiver is up.
- A long-lived client does not survive a lost connection. The application that wants to go on constructs a new client, with the loss's error in hand; the README says so, and so does `MllpClientClosedError`.
- `disconnect` is gone. A lost connection closes the client, so `close` carries its error.
- The default policy gives up about 30 seconds after the first failure, so a `send()` against a host that is down rejects within that budget and a one-shot script exits. A client that must outlast a long outage sets `attempts: Infinity`, as ioredis and Socket.IO do by default, and accepts that the process stays alive until `close()`.
- An idle drop is still noticed only by the next `send()` (#690). Until that lands, the send that discovers the drop fails and closes the client.
- Internally the client is two layers: a session, which owns one socket attempt and knows nothing of retries, and the client, which dials under the policy and whose phases hold the dialing and then the session. There is no connection manager between them.

## Alternatives considered

- **Reconnect only after a connection has opened once**, so a wrong host fails in one connect timeout. Rejected: a daemon that starts before its receiver is the common case, and the bounded default keeps a wrong host cheap.
- **A bounded default of a few seconds.** Tried first. Rejected: it covers a network blip and nothing else; a receiving engine restart takes tens of seconds. The 30-second budget covers that.
- **Unlimited attempts by default**, as ioredis, Socket.IO, MQTT.js, and gRPC ship. Rejected: with `sendTimeoutMs` starting at the write, a `send()` against a host that is down would never settle, and every one-shot script and the CLI would hang instead of failing.
- **A separate `reconnecting` phase**, as the issue proposed. Rejected: it holds the same fields and runs the same loop as `connecting`, and a lost connection is not something the client reports.
- **Passing the failure to `delay(attempt, error)`**, so a policy could stop on a permanent cause. Rejected: nothing needs it, and the attempt limit already bounds a permanent failure.
- **`retry` as the option name** (the issue's proposal). Rejected: reserved for message retry, which has the opposite safety profile.
- **Resending the lost message when the write itself rejected**, on the grounds that nothing reached the wire. Rejected: a write can succeed locally and fail on the wire, so "the write rejected" is not "not delivered".
- **Reopening the connection after a loss** (the first form of this decision, 2026-09-10 to 2026-09-12). Built twice: once dialing in the background as soon as the loss was seen, then lazily on the next `send()` or `connect()`. Both needed a connection manager between the session and the client that could be closed and opened again, with a phase of its own, a terminal state, and a way to learn that the session it held had ended; the second also left the client reading `idle` after a loss. Rejected on 2026-09-12: a client that reopens its connection re-creates, one level up, the lifecycle a socket already has, and the application still had to handle the loss because the message in flight was gone either way. A loss now closes the client, the socket's own model.

## Related

- Issues #714 (this decision), #690 (idle drop detection), #646 (idempotency and retry)
- ADR 0018 (error model), ADR 0019 (acknowledgment translation)
- `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md`
