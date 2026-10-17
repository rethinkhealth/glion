---
"@glion/mllp": patch
---

The server's `tls` option takes `requestCert` and `rejectUnauthorized`, passed to Node's TLS server as given. With `requestCert: true`, a remote system that presents no client certificate, or one `ca` does not verify, is refused during the handshake. Before, `tls.ca` had no effect: Node never asked for a client certificate.
