---
"@glion/mllp-client": patch
---

Internal refactor: model the connection lifecycle as an XState state machine and extract the per-connection wire layer into its own module.

- `state.ts` — a pure (no-I/O) XState v5 machine is now the authority for the connection lifecycle (`idle → connecting → connected → closed`), with reconnect/backoff states wired but disabled by default (`NO_RECONNECT`), so behaviour is unchanged.
- `reconnect.ts` — reconnect policy types + capped-exponential-with-jitter backoff math, kept separate from the machine.
- `connection.ts` — `createConnection()` owns one socket's mortal state (frame decoder, reader/writer, the single-flight write→ACK exchange, drop detection) and its own teardown. Making a connection a discrete object is the groundwork for safe reconnect.

No public API or behaviour change; the full test suite is unchanged and green.
