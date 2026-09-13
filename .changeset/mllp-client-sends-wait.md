---
"@glion/mllp-client": minor
---

`send()` waits for the message in flight instead of refusing.

A `send()` arriving while another message is on the wire now waits for its acknowledgment, then goes out. Waiting sends leave one at a time, and a batch fired at once goes out in order, so `Promise.all` over a batch delivers it on one connection; a send made while others are waiting may go ahead of them. The line is in memory and has no bound; `timeoutMs` runs from the write, not from the call. A send still waiting when `close()` or `destroy()` is called, or when a failure closes the client, rejects with `MllpClientClosedError` and `delivery: "not-sent"`, so nothing goes out behind a message whose delivery is unknown.

**Breaking:** `MllpAlreadySendingError` and `MllpErrorCode.ALREADY_SENDING` are removed. A `switch` over `MllpErrorCode` that listed the code loses that arm; a handler that awaited and resent on it can drop the loop.
