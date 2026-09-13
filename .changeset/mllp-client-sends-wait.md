---
"@glion/mllp-client": minor
---

`send()` waits for the message in flight instead of refusing.

A `send()` arriving while another message is on the wire now waits for its acknowledgment, then goes out. Sends leave in the order they were called, one at a time, so `Promise.all` over a batch delivers it in order on one connection. The queue is in memory and has no bound; `timeoutMs` runs from the moment the write starts, not from the call. A send still waiting when `close()` or `destroy()` is called, or when a failure closes the client, rejects at once with `MllpClientClosedError` and `delivery: "not-sent"`, so nothing goes out behind a message whose delivery is unknown; one waiting behind a dial that fails rejects with the dial's error, as `connect()` does.

`close()` called a second time while the first is waiting out the message on the wire no longer falls through to `destroy()` and aborts it with `SEND_ABORTED`; the message is acknowledged and both calls resolve once the connection is down. `MllpClientClosedError`'s message now says the client closed on a failure and points at `cause`, rather than naming a reconnect that may not have happened.

**Breaking:** `MllpAlreadySendingError` and `MllpErrorCode.ALREADY_SENDING` are removed. A `switch` over `MllpErrorCode` that listed the code loses that arm; a handler that awaited and resent on it can drop the loop.
