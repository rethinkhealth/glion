---
"@glion/mllp-client": minor
---

Add TLS to the runtime adapters.

- `nodeSocket({ host, port, tls })` on Node.js, Bun, and Deno. `tls: true` verifies the receiver against the runtime's trusted CAs; an object adds `ca`, `cert`, `key`, `passphrase`, `pfx`, `servername`, and `rejectUnauthorized`, typed as `NodeTlsOptions`.
- `workersSocket({ host, port, tls })` on Cloudflare Workers. `tls` is a boolean; any other value throws `MllpInvalidOptionError`.
- A failed handshake rejects with `CONNECTION_FAILED`, with the TLS error on `cause`.
