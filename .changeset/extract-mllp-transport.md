---
"@glion/mllp-transport": minor
"@glion/mllp": minor
"@glion/mllp-client": patch
---

Extract MLLP wire-protocol primitives into a new package, `@glion/mllp-transport`. The new package owns the framing constants, encoder, decoder, decoder stream, base `MllpError` class, and `TransportError` subclass — everything that is independent of whether you are building a server or a client.

`@glion/mllp` (the server framework) now depends on `@glion/mllp-transport` and re-exports the same symbols from its top-level entry, so existing consumers see no API change. New code can import transport primitives directly from `@glion/mllp-transport`.

`@glion/mllp-client` now depends on `@glion/mllp-transport` instead of `@glion/mllp`. The client no longer pulls in the server framework just to access the wire codec.
