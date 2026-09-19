---
"@glion/cli": minor
---

Send over TLS with `glion send` (#657).

- Add `client.tls` to `GlionConfig`: `true`, or `{ ca, cert, key, passphrase, pfx, servername, rejectUnauthorized }` with file paths resolved against the config file, passed to `nodeSocket`'s `tls`
- Verify the receiver against the authority `client.tls.ca` names, or against its own certificate when it signed itself, as a development server does; `client.tls: true` verifies against the runtime's CAs alone and `false` dials plain TCP
- Report a TLS file that cannot be read as the `invalid` outcome, before dialing, naming the target it was aimed at
- Mark a TLS connection with `TLS` on the `== connected` line, and `TLS unverified` when `rejectUnauthorized: false` turned certificate verification off, so the line never claims a certificate was checked when it was not
