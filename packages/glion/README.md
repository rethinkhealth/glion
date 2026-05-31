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
import { ackMiddleware } from "@glion/mllp-ack";

export default new Mllp()
  .parser(parseHL7v2)
  .use(ackMiddleware())
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

| Field             | Type                            | Description                                                          |
| ----------------- | ------------------------------- | -------------------------------------------------------------------- |
| `entry`           | `string`                        | Path to the app file. Defaults to `./glion.app.ts` when unspecified. |
| `port`            | `number`                        | Port to listen on. Defaults to `2575` (the MLLP standard).           |
| `hostname`        | `string`                        | Interface to bind. Defaults to `0.0.0.0`.                            |
| `tls`             | `{ cert: string; key: string }` | Enable MLLP over TLS.                                                |
| `watch`           | `string[]`                      | Additional paths the dev watcher should reload on.                   |
| `gracefulCloseMs` | `number`                        | Drain timeout for `glion start`. Defaults to `5000`.                 |

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

The message is read from `<file>`, or from stdin when `<file>` is omitted or is `-`. It is parsed and re-serialized to its canonical, CR-delimited form before transmission, so editor line endings are normalized. Input that is not an HL7v2 message (no leading `MSH` header) is rejected before anything reaches the wire; content validity is left to the receiver, which answers with a NAK.

| Flag              | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `--host <host>`   | Target host.                                                             |
| `--port <port>`   | Target port.                                                             |
| `--local`         | Reads host and port from `glion.config.ts`; `--host`/`--port` override.  |
| `--config <path>` | Config file used to resolve `--local` (same discovery as `dev`/`start`). |
| `--timeout <ms>`  | Deadline spanning connect and the ACK wait. Defaults to `30000`.         |
| `--json`          | Prints one JSON line instead of the human exchange view.                 |

`--local` resolves the target from the server this project defines: it reads `hostname` and `port` from `glion.config.ts`, mapping a wildcard bind address such as `0.0.0.0` to loopback.

```bash
glion send adt.hl7 --host 127.0.0.1 --port 2575
cat adt.hl7 | glion send --port 2575 --json
glion send adt.hl7 --local
```

Output adapts to the destination: a terminal receives a human-readable exchange view, while a pipe (or `--json`) receives a single JSON line. The exit code reports the result.

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| `0`  | The peer accepted the message (`AA`/`CA`).                         |
| `1`  | The peer rejected the message (a NAK: `AE`/`AR`/`CE`/`CR`).        |
| `2`  | The message could not be delivered (transport, validation, usage). |

TLS targets are not supported; `glion send` connects in plaintext.

### Zero-config mode

Both commands work without a `glion.config.ts` when the app file is at `./glion.app.ts` at the project root. The TUI shows a `zero-config` badge to indicate no config was loaded. Create a `glion.config.ts` when you need custom ports, TLS, or additional watch paths.

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
