# ADR 0022: MLLP Client — Sends Wait Their Turn

## Status

Accepted (2026-09-12)

Revises the part of ADR 0020's rejection that ruled out any queue in the client. ADR 0021 withdrew ADR 0020's mailbox actor; this decision adds a wait, not the actor.

## Context

`@glion/mllp-client` is lockstep: one message on the wire, one acknowledgment back. Until this decision a `send()` arriving while another was in flight rejected at once with `MllpAlreadySendingError` (`ALREADY_SENDING`), so `Promise.all` over a batch delivered the first message and refused the rest, and every application with more than one producer built the same mutex in front of the client. #754 asked whether the client should wait instead.

The protocol allows it: lockstep with a queue in front of it is still lockstep. What the queue changes is what the application can see. HL7v2 event order is semantic (an A01 before its A03), nothing may go out behind a message whose delivery is unknown, and a message waiting in memory exists nowhere else.

## Decision

1. **A `send()` arriving while a message is in flight waits its turn, then goes out.** The client holds a queue of turns in call order. Each `send()` pushes its turn and, unless it is the head, awaits it; the head runs its own exchange and, on finishing however it ended, leaves the queue and resolves the new head's turn. Sends therefore go out in the order they were called, one at a time, and each completion wakes exactly one waiter. The exchange runs in the calling frame, so async context such as a trace span stays with the caller. `MllpAlreadySendingError` and `ALREADY_SENDING` are removed.

2. **The queue has no bound.** The README says so, and says that an interface that must not lose events keeps its own persistent queue in front of the client. A bound, when wanted, is one check on the queue's length before pushing.

3. **`timeoutMs` runs from the write.** Time spent waiting is not counted. A send at the back of a long queue can wait longer than its own timeout before it starts.

4. **A closed client refuses the sends still waiting.** `close()` moves to `closing` at once, so a waiter that wakes into it, or into `closed` after a failure or `destroy()`, rejects with `MllpClientClosedError` and `delivery: "not-sent"`, carrying the failure on `cause`. Nothing goes out behind a message whose delivery is unknown, and `close()` still never cuts off the message on the wire.

## Consequences

- `Promise.all(batch.map((m) => client.send(m)))` delivers the batch in order on one connection; the sequential loop is no longer required.
- Two producers on one client are served first-come first-served. A producer that awaits each send in turn takes its place behind whoever is waiting, so it cannot starve the other.
- A failure under message _n_ rejects _n_ with `delivery: "unknown"` and every message behind it with `CLOSED`, `delivery: "not-sent"`: the application sees the whole tail, in order, and can persist or resend it.
- An application that fires sends without awaiting them and then calls `close()` gets `CLOSED` for everything but the message on the wire. Awaiting the sends first is the documented shape.
- Backpressure is no longer visible on the first overlap. A producer faster than the receiver grows the queue in memory. The client does not measure it; `client.state` reads `sending` throughout.
- The phase graph is unchanged: no queue phase. The queue is one array beside it. `close()` and `destroy()` do not touch it: a waiter that wakes into `closing` or `closed` rejects on its own.

## Alternatives considered

- **Keep the throw** (the recommendation in #754). Rejected by the maintainer: the caller-side mutex was being written by every consumer, and the refusal's information (the in-flight control ID) was never used.
- **A bounded queue with a typed error at the bound**, as the production-readiness plan's T0-1 proposed (`maxQueueSize`, `MllpQueueFullError`). Deferred: no consumer has asked for one. It is one check on the queue's length.
- **`close()` drains the queue before hanging up**, as ioredis's `quit()` and mysql2's `end()` do. Rejected: it needs a `closing` phase that still sends, and a way to tell a waiter from a new call. The application awaits its sends before closing, and `destroy()` is the verb for not waiting.
- **Counting the wait in `timeoutMs`.** Rejected: `SEND_TIMEOUT` means the wire did not answer and closes the client; a message timed out in the queue never reached the wire and should not.
- **A loop over the `sending` phase's `done` promise**, every waiter awaiting the same promise and re-reading the phase. The first form of this decision, four lines. Rejected on 2026-09-13 with a regression test (`tests/regressions/754-waiting-send-overtaken.test.ts`): the in-flight send's caller resumes in the same turn as the waiters, so a send it issues at once takes the wire ahead of them, and a producer that awaits each send in a loop starves every other producer on the client. Every peer surveyed (pg, mysql2, undici, Node's `http.Agent`, ioredis, the MongoDB pool) orders by arrival with an explicit queue; the loop was the one design that did not.
- **A chained promise**: each `send()` awaits the promise of the send before it, replacing it with its own. The same guarantee in nine lines with no array, but the queue is invisible: its length cannot be read or bounded without a counter beside it. The array is the same idea with the queue as a thing that can be looked at.
- **A drain loop**: sends push a message and its resolvers onto an array, and one loop consumes it, as pg and mysql2 do. Rejected: it needs a flag beside the phase to say a drain is running, the exchange runs in whichever call started the loop rather than in the caller's async context, and results travel back through resolvers. Turns in the queue, with the head running its own send, keep the caller as the owner of its exchange.
- **The mailbox actor** (ADR 0020). Rejected before, on 2026-09-07, and unchanged: the turn queue is a dozen lines against the actor's phases, mailbox, and drain.

## Related

- Issue #754 (this decision), #658 (HTTP gateway, the multi-producer consumer)
- ADR 0021 (reconnect; withdraws ADR 0020)
- `docs/plans/2026-09-03-001-feat-mllp-client-production-readiness-plan.md` §T0-1
- `docs/plans/2026-09-10-001-feat-mllp-client-reconnect-and-retry-plan.md` §2 (message retry; its `ALREADY_SENDING` references are superseded by this decision)
