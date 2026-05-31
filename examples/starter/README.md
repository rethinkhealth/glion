# Starter Glion

The minimal HL7v2 MLLP server: one route, ACK middleware, run via the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI on Node.js. This is the default scaffold produced by `pnpm create glion`.

## How to use

Scaffold this example into a new directory:

```bash
pnpm create glion my-glion-app
cd my-glion-app
```

Install dependencies and run:

```bash
pnpm install
pnpm dev      # development: TUI, file-watching, hot reload
pnpm start    # production: JSON-lines logs, no watcher
```

The server listens on `127.0.0.1:2575` by default.

## What's in it

- `glion.config.ts` — entry path and port.
- `src/app.ts` — the `Mllp` instance, exported as the default. The CLI picks it up automatically.
- `samples/adt-a01.hl7` — a sample HL7v2 message for `glion send`.

The app:

- Registers a single `ADT^A01` route that accepts and ACKs the message.
- Uses `ackMiddleware()` from `@glion/mllp-ack` to turn handler return values into `AA` ACKs and throws into the matching NAK.
- Adds a catch-all route that rejects unknown message types with an `AR` NAK.

## Send a test message

With the server running, send the bundled sample from another terminal using the `glion send` CLI command:

```bash
pnpm send     # → AA · MSG001
```

That runs `glion send samples/adt-a01.hl7 --local` — the `--local` flag reads the host and port from `glion.config.ts`, so the message goes to this project's server (`127.0.0.1:2575`):

```
→ sent  127.0.0.1:2575  MSH-10 MSG001  3 segs, 121 B
← ACK   AA  MSA-2 MSG001  3.0ms
```

You can also target a host and port explicitly, pipe a message over stdin, or ask for machine-readable output:

```bash
glion send samples/adt-a01.hl7 --host 127.0.0.1 --port 2575
cat samples/adt-a01.hl7 | glion send --local
glion send samples/adt-a01.hl7 --local --json
```

`glion send` exits `0` on accept (`AA`/`CA`), `1` on a NAK, and `2` when the message could not be delivered.

## Next steps

- Add more routes (e.g. `ORM^O01`, `ORU^R01`) — see [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) for a richer example with logging middleware and typed NAKs.
- Send sample messages from the [`mllp-client`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-client) example.

## Notes

- Requires Node.js ≥ 20.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and routing reference.
- [`@glion/mllp-ack`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-ack) — ACK middleware.
- [`@glion/ack`](https://github.com/rethinkhealth/glion/tree/main/packages/ack) — `AckException` hierarchy.
