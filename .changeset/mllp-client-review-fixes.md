---
"@glion/mllp-client": patch
---

Apply review feedback to `MllpClient`:

- Switch the `exchange()` socket error handler from `socket.on` to `socket.once` for symmetry with `openConnection()` and to avoid keeping a phantom listener attached after the socket settles.
- Spell out `rejectUnauthorized: options.tls.rejectUnauthorized ?? true` so the TLS verification posture is obvious at the call site and protected against future Node default changes.
- Replace the wide `Hl7ErrorCodeValue` / `SeverityValue` casts in `buildAckException` with explicit `coerceErrorCode` / `coerceSeverity` helpers backed by `Object.values(...)` lookup sets. Unknown receiver codes still fall back to the documented defaults; the policy is now visible.
- Map `socket.write` callback errors to `MllpClientError(CONNECTION_CLOSED)` with a `"Failed to write MLLP frame: …"` message instead of letting them fall through `mapSocketError`'s generic "Connection error" default.
- Simplify the `once<Args>` generic into a focused `makeRunOnce()` helper that takes the work directly, removing the inner `(finalize) => finalize()` indirection at every call site.
- Inline the single-use `readDecodedFrames` helper so the decoder pipeline lives next to its consumer.

Add five new transport-error test cases covering `CONNECTION_CLOSED`, `MALFORMED_ACK`, `MALFORMED_FRAME` (`maxAckSize` enforcement), cross-package `instanceof MllpError` identity, and post-success socket cleanup. Tests use a small raw-TCP-server helper so each scenario sends exactly the bytes it needs.

Document the client's deliberate omissions (no pooling, no retry, no queueing, no streaming response, no outbound size cap) in a new "Limitations" section of the README, and note that the `Acknowledgment.tree` AST type comes from `@glion/ast`.
