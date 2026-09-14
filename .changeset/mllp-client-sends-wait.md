---
"@glion/mllp-client": minor
---

`send()` waits for the message in flight instead of refusing.

A `send()` arriving while another message is on the wire now waits for its acknowledgment, then goes out. Sends leave in the order they were called, one at a time, so `Promise.allSettled` over a batch delivers it in order on one connection. The queue is in memory and has no bound; `timeoutMs` runs from the moment the write starts, not from the call. A send still waiting when `close()` or `destroy()` is called, or when a failure closes the client, rejects at once with `MllpClientClosedError` and `delivery: "not-sent"`, so nothing goes out behind a message whose delivery is unknown; one waiting behind a dial that fails rejects with the dial's error, as `connect()` does.

`close()` called a second time while the first is waiting out the message on the wire no longer falls through to `destroy()` and aborts it with `SEND_ABORTED`; the message is acknowledged and both calls resolve once the connection is down. A `close()` or `destroy()` arriving during the teardown itself likewise resolves only once the connection is down, where it used to resolve at once. `destroy()` takes an optional `reason`, the failure the client then reports on `close` and on `cause`, as `net.Socket.destroy(error)` does; arriving during an ending already under way, it cuts the message in flight and joins that ending. `close()` reports the failure of a message it was waiting out, rather than `null`, whether the failure landed before or after the call. A call cancelled by `destroy(reason)` while dialing, or arriving during its teardown, gets `CLOSED` with `reason` on `cause`. `client.state` reads `closing` for the whole of that teardown, whether `close()`, `destroy()`, or a failure started it, and `closed` only once the connection is down; the `close` event fires at that point. `MllpClientClosedError`'s message now says the client closed on a failure and points at `cause`, rather than naming a reconnect that may not have happened.

`client.pending` reports how many sends wait their turn, the one in flight excluded.

**Breaking:** `MllpAlreadySendingError` and `MllpErrorCode.ALREADY_SENDING` are removed. A `switch` over `MllpErrorCode` that listed the code loses that arm; a handler that awaited and resent on it can drop the loop.
