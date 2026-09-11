---
"@glion/mllp-client": minor
---

Reconnect after a failed attempt or a lost connection.

A connection that cannot be opened, or that is lost, is dialed again under a new `reconnect` option: `attempts` (default 5) and `delay(attempt)` (default full-jitter backoff from 200 ms, capped at 2 s). The client returns to `connecting`, and `connect` fires again when a connection opens. The `disconnect` event is removed; `close` now carries the failure the policy could not recover from, or `null` when the owner closed the client. `reconnect: false` keeps the previous behaviour, where a lost connection closes the client.

A message in flight when the connection is lost is not sent again: its `send()` still rejects with `CONNECTION_LOST`, `SEND_TIMEOUT`, or `INVALID_RESPONSE`. A `send()` or `connect()` arriving while the client is reconnecting waits for the new connection. `close()` and `destroy()` stop a reconnect at once.

`MllpClientClosedError` gains `cause`: the last attempt's failure, when the client closed because the policy gave up.
