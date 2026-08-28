---
"@glion/mllp": patch
"@glion/ack": patch
"@glion/cli": patch
---

Remove `@glion/mllp-ack` from the ecosystem: `ackMiddleware` and `acknowledge()` are retired ahead of built-in acknowledgment translation at the framework's error boundary in `@glion/mllp` (ADR 0019).

- Remove `@glion/mllp-ack` from quick-start snippets and package catalogs; apps reply by returning a `Response` or via `app.onError()` until the built-in translation lands
- Remove the `@glion/mllp-ack` workspace dependency from `@glion/cli`
