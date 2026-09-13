# ADR 0022: MLLP Client — Sends Wait Their Turn

## Status

Accepted (2026-09-12)

Revises the part of ADR 0020's rejection that ruled out any queue in the client. ADR 0021 withdrew ADR 0020's mailbox actor; this decision adds a wait, not the actor.

## Context

`@glion/mllp-client` is lockstep: one message on the wire, one acknowledgment back. Until this decision a `send()` arriving while another was in flight rejected at once with `MllpAlreadySendingError` (`ALREADY_SENDING`), so `Promise.all` over a batch delivered the first message and refused the rest, and every application with more than one producer built the same mutex in front of the client. #754 asked whether the client should wait instead.

The protocol allows it: lockstep with a line in front of it is still lockstep. What the line changes is what the application can see. HL7v2 event order is semantic (an A01 before its A03), nothing may go out behind a message whose delivery is unknown, and a message waiting in memory exists nowhere else.

## Decision

1. **A `send()` arriving while a message is in flight waits for it, then goes out.** The wait is a loop at the top of `send()` over the `sending` phase's `done` promise; on waking, each waiter re-reads the phase, and the first to find `connected` moves to `sending` without an `await` in between. Waiting sends go out one at a time, and sends waiting together go out in the order they arrived. A send made while others are waiting, such as one issued from an earlier send's acknowledgment, may go out before them: it runs in the same turn they wake in and finds the client `connected` first. `MllpAlreadySendingError` and `ALREADY_SENDING` are removed.

2. **The line has no bound.** It is the callers' own pending promises, nothing the client stores. The README says so, and says that an interface that must not lose events keeps its own persistent queue in front of the client.

3. **`timeoutMs` runs from the write.** Time spent waiting is not counted. A send at the back of a long line can wait longer than its own timeout before it starts.

4. **A closed client refuses the sends still waiting.** `close()` moves to `closing` at once, so a waiter that wakes into it, or into `closed` after a failure or `destroy()`, rejects with `MllpClientClosedError` and `delivery: "not-sent"`, carrying the failure on `cause`. Nothing goes out behind a message whose delivery is unknown, and `close()` still never cuts off the message on the wire.

## Consequences

- `Promise.all(batch.map((m) => client.send(m)))` delivers the batch in order on one connection; the sequential loop is no longer required.
- Two producers on one client are served one at a time but not first-come first-served: a producer that awaits each send in turn re-takes the wire on every acknowledgment, ahead of a send already waiting, for as long as it keeps sending. The README says so. A producer that needs its place kept fires its sends together, or owns the client.
- Every completion wakes every waiter, N(N-1)/2 wakeups over a batch of N; negligible at the batch sizes a caller awaits, and the reason the line is documented as unbounded rather than encouraged.
- A failure under message _n_ rejects _n_ with `delivery: "unknown"` and every message behind it with `CLOSED`, `delivery: "not-sent"`: the application sees the whole tail, in order, and can persist or resend it.
- An application that fires sends without awaiting them and then calls `close()` gets `CLOSED` for everything but the message on the wire. Awaiting the sends first is the documented shape.
- Backpressure is no longer visible on the first overlap. A producer faster than the receiver grows the line in memory. The client does not measure it; `client.state` reads `sending` throughout.
- The phase graph is unchanged: no queue phase, no queue object, no counter. `close()` and `destroy()` are unchanged in code.

## Alternatives considered

- **Keep the throw** (the recommendation in #754). Rejected by the maintainer: the caller-side mutex was being written by every consumer, and the refusal's information (the in-flight control ID) was never used.
- **A bounded line with a typed error at the bound**, as the production-readiness plan's T0-1 proposed (`maxQueueSize`, `MllpQueueFullError`). Deferred: the bound needs a counter the client would have to own, and no consumer has asked for one. It can be added without changing the shape of the wait.
- **`close()` drains the line before hanging up**, as ioredis's `quit()` and mysql2's `end()` do. Rejected: it needs a `closing` phase that still sends, and a way to tell a waiter from a new call. The application awaits its sends before closing, and `destroy()` is the verb for not waiting.
- **Counting the wait in `timeoutMs`.** Rejected: `SEND_TIMEOUT` means the wire did not answer and closes the client; a message timed out in line never reached the wire and should not.
- **A chained turn**: each `send()` awaits the promise of the send before it and settles its own in a `finally`, so order is strictly by call and each completion wakes one waiter. Built and tested on 2026-09-13, then set aside by the maintainer for the plain wait: a field, a `try`/`finally`, and a resolver against four lines, for a guarantee no consumer has asked for. It is the change to make if a producer being overtaken is ever reported; the regression test for it is in this ADR's history.
- **The mailbox actor** (ADR 0020). Rejected before, on 2026-09-07, and unchanged: the wait loop is four lines against the actor's phases, mailbox, and drain.

## Related

- Issue #754 (this decision), #658 (HTTP gateway, the multi-producer consumer)
- ADR 0021 (reconnect; withdraws ADR 0020)
- `docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` §T0-1
- `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md` §2 (message retry; its `ALREADY_SENDING` references are superseded by this decision)
