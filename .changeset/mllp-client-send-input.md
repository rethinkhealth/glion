---
"@glion/mllp-client": minor
---

Make the AST the first-class send currency, and drop `Uint8Array` from the public API.

- **`send(string | Root)` parses every input to a tree and re-serializes it to canonical HL7v2 for the wire.** The client is now an _originating / cleaning_ client, not a byte-exact relay — it emits clean HL7v2 rather than forwarding the caller's bytes unchanged. A `string` is parsed first (it is a serialized tree); a `Root` is used directly. The same single parse drives both the wire bytes and the MSH-10 correlation ID.
- **Cleaning is syntactic only — semantics are preserved.** Line endings normalize to CR and trailing empty fields / segments are trimmed; escape sequences (`\F\`, `\X0D\`), Z-segments, repetitions, and components round-trip verbatim. Known limitations (documented): trailing-empty trimming is not idempotent (it drops one trailing empty field per pass), and a `Root` that was escape-_decoded_ upstream must not be passed in, since `toHl7v2` has no re-encode step.
- **`SendInput` is `string | Root`** (was `string | Uint8Array | Root`). `Uint8Array` was the only input whose type _name_ implied "send these exact bytes" — a byte-fidelity contract the cleaning round-trip provably cannot keep — yet it was merely decoded-then-parsed identically to a `string`. Removing it makes the contract honest.
- **`MllpClientResponse.raw` and `MllpClientError.raw` are `string`** (decoded ACK text, were `Uint8Array`), matching `@glion/ack` `AckException.raw`. Both directions now speak `string`, so a receive-then-forward caller no longer hand-decodes `response.raw` to feed it back into `send()`.

Migration: pass a `string` (or `Root`) to `send()`; if you hold wire bytes, decode them to text at your I/O boundary (where charset / MSH-18 knowledge lives) and pass the `string`. A non-UTF-8 **inbound** ACK still surfaces `PARSE_FAILED` (ACKs are decoded as strict UTF-8 via `@glion/util-charset`).
