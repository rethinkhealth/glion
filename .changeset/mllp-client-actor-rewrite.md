---
"@glion/mllp-client": patch
---

Internal: rebuild the client's lifecycle as a single-owner mailbox actor (ADR 0020). The public surface is unchanged — same class, methods, getters, options, defaults, state strings, response shape, and error taxonomy.

One behavioural delta: a `send()` interrupted by `close()` now always reports `delivery: "unknown"` rather than racing between `unknown` and `not-sent` depending on whether the write promise had settled. `not-sent` is now reserved for a write that actually failed. This is the safe direction — once bytes are handed to the transport, whether the remote system received them is genuinely unknown.
