# Starter Glion

The smallest HL7v2 MLLP server: it receives a message, logs it, and answers `AA`. Run by the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI on Node.js. This is the default scaffold of `pnpm create glion`.

## How to use

```bash
pnpm create glion my-glion-app
cd my-glion-app
pnpm install
pnpm dev      # development: terminal UI, reload on change, listens on 127.0.0.1:2575
pnpm start    # production: JSON-line events, listens on 0.0.0.0:2575
```

## What's in it

- `glion.config.ts` — the entry file and port. See [`@glion/cli`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) for TLS, file logging, and the rest.
- `src/app.ts` — the routes: `ADT^A01`, and `*` for every other message type. Each logs the message and answers `AA`.
- `src/accept.ts` — builds the `AA` acknowledgment.
- `samples/` — messages to send to it.

The logs name the message type and its control ID (MSH-10), never patient data. `glion dev` shows what the app logs next to each message; `glion start` writes it as JSON lines.

## Send a test message

With the server running, from another terminal:

```bash
pnpm send                                                  # samples/adt-a01.hl7
pnpm exec glion send samples/oru-r01.hl7 --host 127.0.0.1  # handled by the * route
```

```text
→ sent  127.0.0.1:2575  MSH-10 MSG001  3 segs, 121 B
← ACK   AA  MSA-2 MSG001  3.0ms
```

## Next steps

The [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) example adds what a real interface needs: validation against the HL7v2 standard, NAKs (`AE`, `AR`) with error codes, an error handler, and tests.

## Notes

- Requires Node.js 22 or later.
- `glion dev` listens on loopback only. `glion start` listens on every interface; MLLP has no authentication of its own, so put it behind TLS or a private network.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and routing.
