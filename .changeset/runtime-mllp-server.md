---
"@glion/mllp": minor
---

Migrate the server to the new `@glion/mllp-transport` API (`frame` / `FrameDecoderStream`). The package no longer re-exports the transport surface — import `@glion/mllp-transport` directly. A missing parser now throws `MllpServerError` (`NO_PARSER`) instead of a transport error, and the Node adapter tears connections down gracefully (FIN) so a rejected `onConnect` no longer resets the peer.
