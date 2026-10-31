# @glion/cli

The `glion` command — development and production runtime for Glion MLLP applications.

## What it does

`@glion/cli` provides the `glion` binary that runs Glion applications. A single-file MLLP app exported as `export default new Mllp()` becomes a running server with `glion dev` (for development with live reload and a terminal UI) or `glion start` (for production with graceful shutdown and structured logs). `glion send` is a client utility that sends one HL7v2 message over MLLP and prints the acknowledgment. The CLI reads configuration from a `glion.config.ts` file when present or infers defaults when not.

## Install

```bash
npm install @glion/cli
```

## Use

Define your app in a single file:

```ts
// glion.app.ts
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

export default new Mllp()
  .parser(parseHL7v2)
  .on("ADT^A01", handleAdmit)
  .on("ORU^R01", handleResult);
```

Add the two scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "glion dev",
    "start": "glion start"
  }
}
```

Run `npm run dev` during development. Run `npm start` in production.

## API

### `defineConfig(config)`

Identity helper for `glion.config.ts` that gives TypeScript inference over the configuration schema:

```ts
// glion.config.ts
import { defineConfig } from "@glion/cli/config";

export default defineConfig({
  entry: "./src/app.ts",
  port: 2575,
  hostname: "0.0.0.0",
});
```

### `GlionConfig`

Type exported from `@glion/cli/config`:

| Field             | Type                            | Description                                                                                            |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `entry`           | `string`                        | Path to the app file. Defaults to `./glion.app.ts` when unspecified.                                   |
| `port`            | `number`                        | Port to listen on. Defaults to `2575` (the MLLP standard).                                             |
| `hostname`        | `string`                        | Interface to bind. Defaults to `0.0.0.0`.                                                              |
| `tls`             | `{ cert: string; key: string }` | Enable MLLP over TLS.                                                                                  |
| `maxConnections`  | `number`                        | Most connections open at once; one past it is closed before any message is read. Unlimited when unset. |
| `socketTimeout`   | `number`                        | Idle time in ms after which a connection is closed. `0` or unset disables it.                          |
| `watch`           | `string[]`                      | Additional paths the dev watcher should reload on.                                                     |
| `gracefulCloseMs` | `number`                        | Drain timeout for `glion start`. Defaults to `5000`.                                                   |

## Commands

### `glion dev`

Runs the app with live reload. Watches the entry file and any paths listed in `watch`, cold-restarts on change, and renders a live terminal UI showing request/response counts, uptime, and error summaries. Falls back to log-only mode when stdout is not a TTY (CI, piped output).

### `glion start`

Runs the app in production. Emits JSON-line events to stdout for log aggregators, handles `SIGTERM` with a graceful drain (`gracefulCloseMs`, default 5000), and exits cleanly when the drain completes.

### `glion send`

Sends a single HL7v2 message over MLLP, prints the acknowledgment, and exits. It is a client utility for the dev loop — sending a message to a running server and reporting how it responds — rather than part of the server runtime.

```bash
glion send [<file>] [flags]
```

The message is read from `<file>`, or from stdin when `<file>` is omitted or is `-`. It is parsed, and each segment is sent ending with a carriage return, whatever line breaks the file holds. An empty line is sent as an empty segment, a carriage return alone. A value the message's own delimiters cannot write is refused before dialing rather than sent mangled: when every escape sequence for one of its characters would hold a delimiter, there is no way to put the value on the wire — delimiters that are ASCII punctuation can write every character. Whether the message is valid is the receiver's call — it answers with a NAK — so `glion send` does not pre-validate.

| Flag             | Description                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `--host <host>`  | Target host. Required.                                                                              |
| `--port <port>`  | Target port. Defaults to `2575`, the port MLLP standardizes on.                                     |
| `--tls`          | Dials over TLS, verifying the receiver's certificate against the runtime's trusted authorities.     |
| `--ca <path>`    | The authority that signed the receiver's certificate, or its own certificate when it signed itself. |
| `--cert <path>`  | Client certificate to present, for a receiver that requires one.                                    |
| `--key <path>`   | The private key for that certificate.                                                               |
| `--insecure`     | Dials over TLS without verifying the receiver's certificate.                                        |
| `--timeout <ms>` | Deadline spanning connect and the ACK wait. Defaults to `30000`.                                    |
| `--json`         | Prints one JSON line instead of the human exchange view.                                            |

The target is the one the invocation names. `glion send` is a client: it sends to the system you point it at, and takes no part in what address a server of this project binds — so sending to your own dev server is the same command as sending to any other receiver. It reads no `glion.config.ts`, and takes no `--config`: everything it needs is on the command line.

```bash
glion send adt.hl7 --host 127.0.0.1
cat adt.hl7 | glion send --host 127.0.0.1 --port 2575 --json
```

Output adapts to the destination: a terminal receives a human-readable exchange view, with the connection's opening and any loss of it reported on stderr, while a pipe (or `--json`) receives a single JSON line. The exit code reports the result.

A failure states what is wrong in one sentence. What to do about it follows as a `hint`, and the underlying error as a `cause` — on their own lines in the terminal, as their own fields in JSON — so the sentence stays readable and the detail stays available.

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | The peer accepted the message (`AA`/`CA`).                         |
| `1`  | The peer rejected the message (a NAK: `AE`/`AR`/`CE`/`CR`).        |
| `2`  | The message could not be delivered (transport, validation, usage). |

#### TLS

`glion send` connects in plaintext unless the invocation asks for TLS. Naming any certificate file asks for it, so `--tls` is only needed when the invocation names none.

```bash
# a receiver with a publicly trusted certificate
glion send adt.hl7 --host hl7.example.org --tls

# a receiver that signed its own certificate, as a development server does
glion send adt.hl7 --host 127.0.0.1 --ca ./server-cert.pem

# a receiver that requires a client certificate
glion send adt.hl7 --host hl7.example.org --ca ./ca.pem --cert ./client.pem --key ./client-key.pem
```

The connection line reports how the connection is secured: `TLS` when the certificate was verified, `TLS unverified` when `--insecure` turned verification off.

A certificate file that cannot be read is reported before the dial, naming the file and the reason.

### Without a config file

A `glion.config.ts` is optional. With none, glion runs the app at `./glion.app.ts` or `./src/glion.app.ts` on the defaults: port `2575`, bound to `127.0.0.1` under `glion dev` and `0.0.0.0` under `glion start`. A config file is how you change them — custom ports, TLS, or additional watch paths.

### Cross-runtime invocation

The `glion` binary ships with `#!/usr/bin/env node`. Bun and Deno require explicit opt-in:

| Runtime | Invocation                                                          |
| ------- | ------------------------------------------------------------------- |
| Node    | `npm run dev` / `npm start` / `npx glion dev`                       |
| Bun     | `bun --bun run dev` (package.json script) or `bunx --bun glion dev` |
| Deno    | `deno task dev` with a `deno.json` task that runs the bin           |

## Part of Glion

`@glion/cli` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
