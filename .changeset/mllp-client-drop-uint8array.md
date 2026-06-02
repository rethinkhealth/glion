---
"@glion/mllp-client": minor
---

Drop `Uint8Array` from the public API — the client speaks `string` + `Root` only.

- **`SendInput` is now `string | Root`** (was `string | Uint8Array | Root`). `Uint8Array` was the only input whose type _name_ implied "send these exact bytes" — a byte-fidelity contract the cleaning round-trip (`parse → toHl7v2`) provably cannot keep — yet it was merely decoded-then-parsed identically to a `string`. Removing it makes the contract honest and deletes a branch plus a failure mode. A caller holding wire bytes decodes them to text at its own I/O boundary (where charset / MSH-18 knowledge lives) and passes the `string`: `client.send(new TextDecoder("utf-8", { fatal: true }).decode(bytes))`.
- **`MllpClientResponse.raw` is now `string`** (decoded ACK text, was `Uint8Array`), and `MllpClientError.raw` (on `CORRELATION_MISMATCH`) is likewise `string`. Both directions now speak `string`, so a receive-then-forward caller no longer has to hand-decode `response.raw` to feed it back into `send()`. This also matches `@glion/ack` `AckException.raw`, which was already a `string`.
- The send path no longer decodes bytes, so the send-side `PARSE_FAILED`-on-non-UTF-8 case is gone. `PARSE_FAILED` still surfaces for a non-parseable or non-UTF-8 **inbound** ACK (decoded as strict UTF-8).
- **Internal reorg:** the format-named `hl7v2.ts` (meaningless in the client) is split along the send/response seam into `send.ts` (`SendInput`, `PreparedSend`, `prepareSend`) and `response.ts` (`MllpClientResponse`, `parseResponse`). No public entry-point change — types are still re-exported from the package root.

Migration: pass a `string` (or `Root`) to `send()`; if you hold bytes, decode them first (the one-liner above is the exact decode the client used to do internally, so non-UTF-8 still fails loud at your boundary). Read `response.raw` as a `string`.
