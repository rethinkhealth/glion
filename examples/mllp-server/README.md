# MLLP server (Node)

A basic HL7v2 MLLP server with route handlers and ACK/NAK responses, run via the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI on Node.js.

## How to use

Scaffold this example into a new directory:

```bash
pnpm create glion my-mllp-server --example mllp-server
cd my-mllp-server
```

Install dependencies and run:

```bash
pnpm install
pnpm dev      # development: TUI, file-watching, hot reload
pnpm start    # production: JSON-lines logs, no watcher
```

The server listens on `127.0.0.1:2575` by default.

## What's in it

- `glion.config.ts` — entry path, port (`2575`), optional TLS / watch.
- `src/app.ts` — the `Mllp` instance, exported as the default. The CLI picks it up automatically.
- `samples/` — sample HL7v2 messages for `glion send` (`adt-a01` accepts, `oru-r01` is rejected, `adt-a01-8859` is rejected for its non-UTF-8 character set).

The app:

- Registers routes for `ADT^A01`, `ORM^O01`, and `ORU^R01`, plus a catch-all (`*`) that rejects unknown message types.
- Uses `ackMiddleware()` from `@glion/mllp-ack` to turn handler return values into `AA` ACKs and handler throws into the matching NAK (`AE`/`AR`/`CE`/`CR`).
- Uses `charsetMiddleware()` from `@glion/mllp-charset` to reject any message whose `MSH-18` character set is not UTF-8-compatible with an `AR` NAK, before routing.
- Adds a small logging middleware to show the onion model: log on entry, `await next()`, log the result.
- Throws `AckApplicationError` from the `ORU^R01` route to demonstrate a typed NAK end-to-end.

## Send a test message

With the server running, send the bundled sample from another terminal using the `glion send` CLI command:

```bash
pnpm send     # → AA · MSG001
```

That runs `glion send samples/adt-a01.hl7 --local`. The `--local` flag reads the host and port from `glion.config.ts`, so the message goes to this project's server (`127.0.0.1:2575`) without retyping the address:

```
→ sent  127.0.0.1:2575  MSH-10 MSG001  3 segs, 121 B
← ACK   AA  MSA-2 MSG001  3.5ms
```

You can also target a host and port explicitly, pipe a message over stdin, or ask for machine-readable output:

```bash
glion send samples/adt-a01.hl7 --host 127.0.0.1 --port 2575
cat samples/adt-a01.hl7 | glion send --local
glion send samples/adt-a01.hl7 --local --json
```

`glion send` exits `0` on accept (`AA`/`CA`), `1` on a NAK (`AE`/`AR`/`CE`/`CR`), and `2` when the message could not be delivered. The `ORU^R01` route throws a typed NAK, so sending the bundled `oru-r01` sample shows the rejection path end to end:

```bash
glion send samples/oru-r01.hl7 --local     # → AE · Patient not available · exit 1
```

The `adt-a01-8859` sample declares `MSH-18` as `8859/1` (ISO-8859-1), which the server only supports as UTF-8, so `charsetMiddleware()` rejects it with an `AR` NAK before the route runs:

```bash
pnpm send:charset     # → AR · MSH-18 (character set) value '8859/1' is not allowed · exit 1
```

For the programmatic client API — streaming, commit-level acks, mutual TLS — see the [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client) package.

## Notes

- Requires Node.js ≥ 20.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and routing reference.
- [`@glion/mllp-ack`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-ack) — ACK middleware.
- [`@glion/mllp-charset`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-charset) — strict-charset middleware.
- [`@glion/ack`](https://github.com/rethinkhealth/glion/tree/main/packages/ack) — `AckException` hierarchy.
- [`mllp-server-bun`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server-bun) — same app under Bun.
- [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client) — programmatic MLLP client (streaming, modes, TLS).
