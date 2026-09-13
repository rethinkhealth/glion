---
"@glion/mllp-client": minor
---

Add the Cloudflare Workers runtime adapter `workersSocket` at `@glion/mllp-client/workers`.

- Add `workersSocket({ host, port })`, a `MllpSocket` over `cloudflare:sockets`; plain TCP, TLS tracked in #657
