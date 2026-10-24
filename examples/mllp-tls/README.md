# MLLP over mutual TLS

An HL7v2 MLLP server that accepts only clients holding a certificate from its certificate authority, and a client that accepts only a server holding one. Both run on Node.js with no build step.

## How to use

```bash
pnpm create glion my-mllp-tls --example mllp-tls
cd my-mllp-tls
pnpm install
pnpm certs    # writes a development CA, server, and client certificate to certs/
pnpm start    # listens on 127.0.0.1:2575, TLS only
```

From another terminal:

```bash
pnpm send     # node src/send.ts samples/adt-a01.hl7
# AA: message MSG001 was accepted.
```

`pnpm test` generates its own certificates and checks every case below.

## What's in it

- `scripts/certs.sh` — writes a certificate authority, a server certificate for `localhost` and `127.0.0.1`, and a client certificate, valid for 30 days, with OpenSSL. `certs/` is in `.gitignore`.
- `src/certificates.ts` — the TLS options of each side, read from `certs/`.
- `src/server.ts` — starts the app with `serve()` from `@glion/mllp/node`, logs each connection, and drains on `SIGINT` and `SIGTERM`.
- `src/send.ts` — sends one message with `@glion/mllp-client`, then closes.
- `src/app.ts`, `src/accept.ts` — the app from the [starter](https://github.com/rethinkhealth/glion/tree/main/examples/starter): it logs each message and answers `AA`.
- `tests/` — the cases below.

## What each side checks

| Peer                                              | Outcome                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Client with a certificate the CA issued           | Accepted: the message is answered.                                                   |
| Client with no certificate                        | Refused by the server during the handshake. The app never sees the connection.       |
| Client with a certificate another CA issued       | Disconnected by the server once the handshake completes, before any message is read. |
| Server whose certificate the client cannot verify | Refused by the client: `CONNECTION_FAILED`, delivery `not-sent`. Nothing is sent.    |

The server's side is `requestCert: true` with `ca`, passed to `tls.createServer()` through `serve()`'s `tls` option. Every option of [`tls.createServer()`](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) applies there, such as `minVersion` or `ciphers`.

The client's side is the `dial` function given to `nodeSocket()`: it returns `tls.connect()` with the client certificate, the CA, and `servername`, so every option of [`tls.connect()`](https://nodejs.org/api/tls.html#tlsconnectoptions-callback) applies. The server's certificate is checked against `servername`, so `HOST` must be a name the certificate lists (`localhost` here).

Over TLS 1.3, a client refused for its certificate learns it only when it sends: its first `send()` rejects with `CONNECTION_LOST`, delivery `unknown`.

## Configuration

| Variable | `src/server.ts`                                  | `src/send.ts`                               |
| -------- | ------------------------------------------------ | ------------------------------------------- |
| `HOST`   | The interface to listen on. Default `127.0.0.1`. | The server to send to. Default `localhost`. |
| `PORT`   | The port to listen on. Default `2575`.           | The port to send to. Default `2575`.        |

`glion send` can also send with a client certificate:

```bash
glion send samples/adt-a01.hl7 --host localhost --ca certs/ca.pem --cert certs/client.pem --key certs/client-key.pem
```

## Notes

- Requires Node.js 22.18 or later, which runs TypeScript directly, and OpenSSL for `pnpm certs`.
- The certificates are for development only: the CA's key sits next to them. Use certificates from your organization's CA in production.
- `glion start` does not run this server: its `tls` config cannot request client certificates yet ([#1066](https://github.com/rethinkhealth/glion/issues/1066)).
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp#tls) — `serve()` and its `tls` option.
- [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client#tls) — `nodeSocket()` over `tls.connect()`.
