# MLLP server (Bun)

The [`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server) app — routes, validation against the HL7v2 standard, and typed NAKs — run by the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI under [Bun](https://bun.sh). The source is the same; only the runtime differs.

## How to use

```bash
pnpm create glion my-mllp-server --example mllp-server-bun
cd my-mllp-server
pnpm install
pnpm dev      # development: terminal UI, reload on change, listens on 127.0.0.1:2575
pnpm start    # production: JSON-line events, listens on 0.0.0.0:2575
```

Every script runs `bun --bun glion …`. Without `--bun`, the `glion` bin's `#!/usr/bin/env node` line hands it to Node.

## What's in it

- `glion.config.ts` — the entry file and port.
- `src/app.ts` — the routes, exported as the default `Mllp` app.
- `src/validation.ts` — `validate(ctx)`, which annotates and lints the message against its HL7v2 version.
- `src/acknowledgment.ts` — builds the acknowledgment for each message.
- `samples/` — one message for each outcome.

| Sample                        | Reply                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `adt-a01.hl7`                 | `AA`                                                              |
| `oru-r01.hl7`                 | `AA` once `adt-a01.hl7` has admitted the patient, `AE` 204 before |
| `oru-r01-unknown-patient.hl7` | `AE`, ERR-3 `204`: `The patient is not on file.`                  |
| `adt-a01-invalid.hl7`         | `AE`, ERR-3 `101`: the lint finding for the missing PID-3         |
| `siu-s12.hl7`                 | `AR`, ERR-3 `200`: no route takes `SIU^S12`                       |

[`mllp-server`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server#how-a-message-is-answered) explains how each outcome is answered, and carries the tests.

## Send a test message

With the server running, from another terminal:

```bash
pnpm send     # bun --bun glion send samples/adt-a01.hl7 --host 127.0.0.1
bun --bun glion send samples/siu-s12.hl7 --host 127.0.0.1    # → AR, exit 1
```

`glion send` exits `0` on accept (`AA`/`CA`), `1` on a NAK, and `2` when the message could not be delivered.

## Notes

- Requires [Bun](https://bun.sh) 1.4 or later.
- `glion dev` listens on loopback only. `glion start` listens on every interface; MLLP has no authentication of its own, so put it behind TLS or a private network.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and routing.
- [`@glion/mllp-client`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client) — the MLLP client, which runs on Bun through its `node:net` support.
