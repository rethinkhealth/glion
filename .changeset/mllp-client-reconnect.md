---
"@glion/mllp-client": minor
---

Dial again when a connection attempt fails.

A connection that cannot be opened is dialed again under a new `reconnect` option: `attempts` (default 5, about 30 seconds of backoff in all) and `delay(attempt)` (default full-jitter backoff from 1 s, capped at 30 s). Once the policy gives up, the client closes with the last attempt's error. `reconnect: false` dials once. `close()` and `destroy()` stop the dialing at once.

A lost connection still closes the client, and the message in flight is not sent again: its `send()` rejects with `CONNECTION_LOST`, `SEND_TIMEOUT`, or `INVALID_RESPONSE`. The `disconnect` event is removed; `close` now carries the failure the client closed on, or `null` when the owner closed it. The `MllpConnection` type is no longer exported.

The errors are redesigned around one question, what became of the message: every `MllpClientError` carries `delivery`, `"not-sent"` or `"unknown"`. `CONNECT_FAILED` and `CONNECT_TIMEOUT` are renamed `CONNECTION_FAILED` and `CONNECTION_TIMEOUT` (classes `MllpConnectionFailedError`, `MllpConnectionTimeoutError`); a send cut off by `destroy()` now rejects with `SEND_ABORTED` (`MllpSendAbortedError`) rather than `CLOSED`; `MllpConnectionError` is a new abstract base for the four wire failures; `MllpConnectionLostError` no longer carries `controlId`. `MllpClientClosedError` gains `cause`: the last attempt's failure, when the client closed because the policy gave up.
