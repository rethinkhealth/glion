---
"@glion/mllp-transport": patch
---

Document `createDecoderStream`'s fatal error mode.

The decoder has always supported two error modes, selected by what the user-supplied `onError` callback does:

- **Lenient** (return normally) — the decoder logs/handles the error and keeps scanning for the next valid frame. Right for receivers that process many frames over a long-lived connection.
- **Fatal** (throw) — the throw propagates out of the underlying `transform()` and errors the readable side of the `TransformStream`. Downstream `for await ... of` consumers reject with the thrown value. Right for one-shot exchanges (e.g. `@glion/mllp-client`) where any frame error invalidates the whole exchange.

This release formalises the fatal mode in the JSDoc on `DecoderOptions.onError` and the README, and adds three tests pinning the contract: throwing on garbage bytes errors the readable, throwing on an oversized frame errors the readable, and the thrown value is preserved verbatim through the rejection (no wrapping, no instanceof drift).

Behaviour is unchanged — only the public contract is documented.
