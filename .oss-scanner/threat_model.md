# glion threat model

## What this project does and where untrusted input enters

glion is a TypeScript toolkit for HL7v2, the message format hospitals, laboratories, and health information exchanges use to move clinical data (admissions, orders, results) between systems. It parses HL7v2 text into a `unist` syntax tree, validates it against HL7v2 profiles, serializes it back, and moves it over MLLP (HL7v2 framing over TCP, optionally TLS).

HL7v2 messages carry protected health information. A receiving system is often reachable from many sending systems inside a hospital network or over a VPN, and the sender is rarely authenticated beyond the network itself. Treat as attacker-controlled:

- Every byte an MLLP server receives from a connected peer, before and after framing.
- Every byte an MLLP client receives in reply from the remote system.
- The HL7v2 text given to the parser, including the delimiters it declares in MSH-1 and MSH-2, escape sequences, segment IDs, the version in MSH-12, and the message type and trigger event in MSH-9.
- Any syntax tree built from such text and handed to a later plugin, lint rule, serializer, or query.

Trusted: the application code an integrator writes (handlers, middleware, `glion.config.*` files the CLI loads and runs), the options a caller passes to a public function, the profile JSON bundled in `@glion/profiles`, and query strings a developer writes for `@glion/util-query`.

## Components that matter most / least

Most important:

- `packages/mllp-codec`: MLLP framing and unframing of socket bytes (VT start block, FS CR end block, buffer growth, the 16 MiB default limit on a pending frame).
- `packages/mllp` (server engine and Node adapter `serve()`), `packages/mllp-client` (session, reconnect, reply matching), and their Node (`./node`, also run under Bun and Deno) and Cloudflare Workers (`./workers`) socket adapters.
- `packages/parser`: tokenizer, delimiter detection, and escape-sequence decoding; `packages/to-hl7v2` and `packages/encode-escapes`: serialization and escape encoding, where a decoded value must never be written back so that it changes the message's structure (delimiter injection, segment injection).
- `packages/util-charset`: UTF-8 decoding of wire bytes, which must fail rather than corrupt.
- `packages/ack` and the acknowledgment the server builds from a received message's MSH fields, which echoes attacker-controlled values back on the wire.
- `packages/profiles`: profile loading keyed by the version and names a message declares; a message must not reach files, objects, or prototype members outside the bundled profiles. Also the event-schema engine (`src/engine`), which matches a message's segments against a compiled schema and repairs segment order.

Less important but in scope: `packages/annotate-*`, `packages/lint-*`, `packages/transform-profile-groups`, `packages/jsonify`, `packages/util-*`, `packages/glion` (the `@glion/cli`: `glion dev`, `glion start`, and `glion send`), and `packages/create-glion`, which reads a GitHub repository, ref, and directory from `--example` and downloads that template: it must download from exactly the repository and ref the link names, and write only to the target directory and giget's cache.

Out of scope: `benchmarks/`, `qa/`, `tools/`, `examples/`, `.devcontainer/`, and `.github/`. Third-party dependencies are in scope only through a path reachable from glion code.

## Security goals

- No HL7v2 input, however malformed, crashes the process, hangs it, or makes it use memory or CPU out of proportion to the input's size.
- A peer on one MLLP connection cannot read, delay without bound, or alter the messages or replies of another connection.
- A reply on an MLLP client is never matched to a message it does not answer.
- Parsing then serializing a message never produces a message with more or different segments, fields, or delimiters than the tree holds.
- Lint findings and thrown errors never include the content of a message's fields in their message text; values travel only in typed fields (`actual`, `expected`) the caller chooses to log.
- TLS options a caller passes reach the platform's TLS stack unchanged; glion never weakens them.

## How to exercise it

The image keeps the full checkout at `/src` with dependencies installed and every package built. Node.js 24, pnpm (the version `package.json` names), Bun, and Deno are installed. All tests run offline; network tests use loopback servers they start themselves.

```sh
cd /src
pnpm test                                  # unit tests of every package
pnpm --filter @glion/parser test           # one package
pnpm test:integration:node                 # MLLP client and server over real loopback TCP
pnpm test:integration:bun                  # the same under Bun
pnpm test:integration:deno                 # the same under Deno
pnpm test:cf                               # Workers adapter inside workerd
```

Each package's tests live in `packages/<name>/tests/`; `tests/regressions/` holds one file per past bug. HL7v2 sample messages live in `qa/fixtures/` and in the packages' test fixtures. A minimal server is in `examples/starter/`. To drive a server from a reproducer, import `Mllp` from `@glion/mllp` and `serve` from `@glion/mllp/node`, listen on `127.0.0.1` with port `0`, and connect with `@glion/mllp-client` or a raw `node:net` socket.

## How you rate severity

- **Critical**: remote code execution, or reading or altering another connection's messages, reachable by an unauthenticated MLLP peer or by message content alone.
- **High**: a single message or connection that crashes the server process or the parser (an uncaught exception or rejection outside the caller's handler), structure injection through serialization (a decoded value that becomes a delimiter or a new segment when written back), a reply matched to the wrong message, prototype pollution or file access outside the bundled profiles driven by message content, or message content leaked into error or lint message text.
- **Medium**: denial of service that needs sustained traffic, or input that costs memory or CPU superlinear in its size but stays within the configured limits; a lint rule or validator that a crafted message bypasses so that an invalid message is reported valid.
- **Low**: issues that require a trusted party (the integrator's code or configuration, the developer running the CLI) to act against their own interest.

Show the attacker's cost and the resource exhausted for any denial of service. Do not assign a severity from a theoretical primitive alone.

## Reports and patches

Include the affected package and source, the entry point the attacker reaches, a minimal offline reproducer (an HL7v2 message or byte sequence plus the call or server that processes it), observed and expected behavior, and impact. Where possible, add a focused patch with a regression test written as `packages/<name>/tests/regressions/<symptom>.test.ts`.

## Anything to leave alone

- Without a network route, the tests that dial `192.0.2.1` (TEST-NET-1) to provoke a connect timeout fail with `CONNECTION_FAILED` instead of `CONNECTION_TIMEOUT`: the address is refused at once rather than never answering. Two tests fail this way in `pnpm test:integration:*` and one in `pnpm test:cf`; this is the sandbox, not a finding.

- `socketTimeout` defaults to `0` (no idle timeout) and the server sets no connection limit; operators configure these. Report an exhaustion only if it happens with limits configured.
- glion is pre-1.0; only the latest published version of each `@glion/*` package receives fixes, so do not report issues that exist only in older releases.
- Do not report missing authentication on plain-TCP MLLP; HL7v2 MLLP has none, and TLS with client certificates is the caller's choice.
