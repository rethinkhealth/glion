# MLLP server (Node)

An HL7v2 MLLP server for admissions and lab results: routes, validation against the HL7v2 standard, typed NAKs, and tests that drive it over a real socket. Run by the [`glion`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) CLI on Node.js.

## How to use

```bash
pnpm create glion my-mllp-server --example mllp-server
cd my-mllp-server
pnpm install
pnpm dev      # development: terminal UI, reload on change, listens on 127.0.0.1:2575
pnpm start    # production: JSON-line events, listens on 0.0.0.0:2575
pnpm test     # the app over a real socket, with @glion/mllp-client
```

## What's in it

- `glion.config.ts` — the entry file and port. See [`@glion/cli`](https://github.com/rethinkhealth/glion/tree/main/packages/glion) for TLS, `socketTimeout`, file logging, and the rest.
- `src/app.ts` — the routes, exported as the default `Mllp` app.
- `src/validation.ts` — `validate(ctx)`, which annotates and lints the message against its HL7v2 version.
- `src/acknowledgment.ts` — builds the acknowledgment for each message.
- `samples/` — one message for each outcome below.
- `tests/` — the outcomes below, asserted with `@glion/mllp-client`.

The app admits patients from `ADT^A01` and takes lab results from `ORU^R01` only for a patient it has admitted. Admissions are kept in memory, so they are gone after a restart or a reload under `glion dev`.

| Sample                        | Reply                                                             |
| ----------------------------- | ----------------------------------------------------------------- |
| `adt-a01.hl7`                 | `AA`                                                              |
| `oru-r01.hl7`                 | `AA` once `adt-a01.hl7` has admitted the patient, `AE` 204 before |
| `oru-r01-unknown-patient.hl7` | `AE`, ERR-3 `204`: `The patient is not on file.`                  |
| `adt-a01-invalid.hl7`         | `AE`, ERR-3 `101`: the lint finding for the missing PID-3         |
| `siu-s12.hl7`                 | `AR`, ERR-3 `200`: no route takes `SIU^S12`                       |

### How a message is answered

1. The first middleware runs the handler with `await next()`, then answers `AA` if the handler gave no reply of its own.
2. A handler that refuses a message throws an `AckException` — `AckApplicationError` for `AE`, `AckApplicationReject` for `AR` — with an HL7 error code (Table 0357).
3. The `*` route catches every message type no other route takes and throws `UnsupportedMessageTypeReject`.
4. `app.onError` answers every throw with a NAK. It runs after the whole middleware chain, so the order middleware is registered in does not change the reply. An error that is not an `AckException` is logged in full and answered `AE` with the fixed text `Application internal error`: its message never reaches the sending system.

`@glion/mllp` sends only the reply a handler or `onError` gives it, so the app builds its acknowledgments itself, in `src/acknowledgment.ts`. Every value is written with escape sequences, so text in a NAK cannot break the acknowledgment apart.

### Validation

Routing reads MSH-9 straight from the parsed message. Annotating and linting the message runs only when a handler calls `validate(ctx)` (or `ctx.tree()`), so a message no route takes is never linted. A lint error becomes an `AE` whose MSA-3 is the finding's text, which describes the problem without repeating any value from the message.

The message of an `AckException` you throw goes to the sending system. Keep patient data out of it: `The patient is not on file.`, not the patient's identifier.

## Send a test message

With the server running, from another terminal:

```bash
pnpm send                                                      # adt-a01.hl7 → AA
pnpm exec glion send samples/oru-r01.hl7 --host 127.0.0.1      # → AA
pnpm exec glion send samples/oru-r01-unknown-patient.hl7 --host 127.0.0.1  # → AE, exit 1
```

```
→ sent  127.0.0.1:2575  MSH-10 MSG003  4 segs, 253 B
← NAK   AE  MSA-2 MSG003  2.9ms
        ERR-3 204  ERR-4 E  "The patient is not on file."
```

`glion send` exits `0` on accept (`AA`/`CA`), `1` on a NAK, and `2` when the message could not be delivered. Add `--json` for one JSON line.

## Notes

- Requires Node.js 22 or later.
- `glion dev` listens on loopback only. `glion start` listens on every interface; MLLP has no authentication of its own, so put it behind TLS or a private network. [`mllp-tls`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-tls) shows mutual TLS.
- [`mllp-server-bun`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-server-bun) — the same app under Bun.
- [`mllp-gateway`](https://github.com/rethinkhealth/glion/tree/main/examples/mllp-gateway) — an HTTP gateway that sends to this server.
- [`@glion/mllp`](https://github.com/rethinkhealth/glion/tree/main/packages/mllp) — server API and routing.
- [`@glion/ack`](https://github.com/rethinkhealth/glion/tree/main/packages/ack) — the `AckException` classes and HL7v2 code tables.
