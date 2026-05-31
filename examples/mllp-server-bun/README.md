# MLLP server (Bun)

A basic HL7v2 MLLP server with route handlers and ACK/NAK responses, run via the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI under [Bun](https://bun.sh).

## How to use

Scaffold this example into a new directory:

```bash
pnpm create glion my-mllp-server --example mllp-server-bun
cd my-mllp-server
```

Install dependencies and run:

```bash
pnpm install
pnpm dev      # development: TUI, file-watching, hot reload
pnpm start    # production: JSON-lines logs, no watcher
```

Both scripts use `bun --bun glion …` to force Bun's runtime through the script runner. Without `--bun`, the `glion` bin's `#!/usr/bin/env node` shebang would hand it to Node.

## What's in it

- `glion.config.ts` — entry path and port.
- `src/app.ts` — the `Mllp` instance, exported as the default. The CLI picks it up via the config.
- `samples/adt-a01.hl7` — a sample HL7v2 message for `glion send`.

The app routes `ADT^A01`, `ORM^O01`, and `ORU^R01`, plus a catch-all, and uses `ackMiddleware()` to translate handler return values and throws into ACK/NAK responses. The code is identical to [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) — only the runtime differs.

## Send a test message

With the server running, send the bundled sample from another terminal:

```bash
pnpm send     # → AA · MSG001
```

That runs `glion send samples/adt-a01.hl7 --local` — `--local` reads the host and port from `glion.config.ts`, so the message reaches this project's server (`127.0.0.1:2575`):

```
→ sent  127.0.0.1:2575  MSH-10 MSG001  3 segs, 121 B
← ACK   AA  MSA-2 MSG001  3.1ms
```

Note the `send` script runs `glion send` on **Node** (no `bun --bun`), unlike `dev`/`start`: `glion send` uses the MLLP client, which runs on Node and Cloudflare Workers, not Bun. The Bun server still receives the message normally — only the sending process is Node.

`glion send` exits `0` on accept (`AA`/`CA`), `1` on a NAK, and `2` when the message could not be delivered. The companion [`mllp-client`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-client) example shows the programmatic client API and a NAK round-trip:

```bash
cd ../mllp-client
pnpm send --sample oru-r01     # → AE · Patient not available · ERR 200
```

## Notes

- Requires [Bun](https://bun.sh) (latest).
- [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) — same app under Node.
- [`mllp-client`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-client) — companion client example.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and CLI reference.
