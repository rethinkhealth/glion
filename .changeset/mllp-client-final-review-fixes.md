---
"@glion/mllp-client": minor
---

Apply final security and quality review fixes:

**Must-fix correctness**

- **Deadline timer leak on connect failure.** `MllpClient.send()` now wraps `connect` in the same try/finally as `exchange`, so `deadline.cancel()` runs even when the connection itself rejects. Previously the underlying `setTimeout` would keep the event loop alive for the full timeout (default 30s) after a failed connect — visible in short-lived processes such as CLIs.
- **Unhandled rejection from `duplex.close()`.** `MllpDuplexStream.close()` is typed as `void | Promise<void>`. Adapters that return a rejected Promise (Workers' `socket.close()` is one example) previously surfaced as `unhandledRejection` (a process crash on modern Node). Cleanup is now routed through a `closeDuplexSafely` helper that awaits and swallows the result.
- **Test cleanup.** Removed dead `serve()` server in the "destroys the socket after a successful send" test (leftover from an earlier draft). Replaced the fixed `setTimeout(50)` with an event-based `socket.once("close" | "end", …)` wait so the test no longer flakes on slow CI.

**Quality improvements**

- **Constructor validation.** `MllpClient` now validates options at construction time and throws `MllpClientError(INVALID_INPUT)` for sharp edges that previously surfaced as confusing runtime symptoms: empty `host`, `port` outside `1..65535`, missing `connect`, non-positive `timeout`, non-positive `maxAckSize`.
- **Consistent `releaseLock` warning.** Both the writer and reader release-lock blocks in `exchange()` now route failures through the same `warnReleaseLockOnce` helper so a real stream-state regression surfaces on first occurrence in either path.
- **Signal propagation.** `MllpClient.send()` now exposes the deadline as an `AbortSignal` and forwards it to `connect`. The Deno and Workers adapters honour the signal — a connect-phase deadline aborts the pending socket cleanly. Node already observed the signal.

**New error code**

- **`TLS_HANDSHAKE_FAILED`.** Added to `MllpClientErrorCode`. The Node adapter now routes TLS-specific Node error codes (`CERT_HAS_EXPIRED`, `DEPTH_ZERO_SELF_SIGNED_CERT`, `ERR_TLS_CERT_ALTNAME_INVALID`, `ERR_TLS_HANDSHAKE_TIMEOUT`, `SELF_SIGNED_CERT_IN_CHAIN`, `UNABLE_TO_GET_ISSUER_CERT`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) to it, plus a best-effort message-sniff for TLS errors that lack a stable `error.code`. Distinguishing TLS misconfiguration from generic "connection closed" is meaningful in healthcare deployments where TLS is a recurring incident class.

**Adapter behaviour parity**

- **Workers + Deno: explicit rejection of unsupported `passphrase`.** Both adapters previously silently dropped `tls.passphrase` while loudly rejecting `ca`/`cert`/`key`. They now reject `passphrase` symmetrically with `INVALID_INPUT` so operators get a clear failure rather than a silent no-op.
- **Deno: narrower error mapping.** `Deno.errors.PermissionDenied` / `NotCapable` now route to `INVALID_INPUT` with a message pointing at `--allow-net=…` instead of being miscategorised as `CONNECTION_REFUSED`.

**Documentation**

- README's "custom transport" example is now a fully runnable inline implementation that wraps a browser `WebSocket` into `{ readable, writable, close }` over Web Streams (replaces the previous undefined `wrapWebSocketAsDuplex` placeholder).

**Tests (35 → 37)**

- New core test asserting `deadline.cancel()` runs when `connect` rejects — measures elapsed time as a proxy for the absence of a leaked timer.
- New core test asserting no unhandled rejection surfaces when `duplex.close()` returns a rejected promise.
