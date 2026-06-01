---
"@glion/mllp-client": minor
---

Make the AST the first-class send currency: `send()` now cleans every message before it goes on the wire.

- **`send(string | Uint8Array | Root)` parses every input to a tree and re-serializes it to canonical HL7v2 for the wire.** The client is now an _originating / cleaning_ client, not a byte-exact relay — it emits clean HL7v2 rather than forwarding the caller's bytes unchanged. A `string` / `Uint8Array` is parsed first (it is a serialized tree); a `Root` is used directly. The same single parse drives both the wire bytes and the MSH-10 correlation ID.
- **Cleaning is syntactic only — semantics are preserved.** Line endings normalize to CR and trailing empty fields / segments are trimmed; escape sequences (`\F\`, `\X0D\`), Z-segments, repetitions, and components round-trip verbatim.
- **Known limitations (documented):** trailing-empty trimming is not idempotent (it drops one trailing empty field per pass); a `Root` that was escape-_decoded_ upstream must not be passed in, since `toHl7v2` has no re-encode step (decode-implies-encode invariant); and a non-UTF-8 `Uint8Array` is rejected with `PARSE_FAILED` (the glion ecosystem assumes UTF-8 — whether that assumption is correct is tracked separately).
- Internally, `toWireFrame` + `readRequestControlId` collapse into one `prepareSend(input)` that returns `{ framed, requestControlId }` from a single parse.
