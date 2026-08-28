# @glion/mllp-codec

The MLLP codec for HL7v2: `frame` wraps outbound messages, `unframe` streams inbound bytes back into them.

## What it does

`@glion/mllp-codec` handles the wire framing that wraps every HL7v2 message sent over MLLP. The Minimal Lower Layer Protocol envelopes each message as `<VT> payload <FS><CR>` (`0x0B … 0x1C 0x0D`). This package is that envelope's two verbs: `frame()` wraps one outbound message, and `unframe()` turns an inbound TCP byte stream back into complete messages, reassembling frames that arrive split or batched across chunks.

It is transport-agnostic: it operates on `Uint8Array` bytes and Web Streams, with no socket, runtime, or AST dependency. Protocol violations surface as a single typed `MllpCodecError` discriminated by `MllpCodecErrorCode`.

## Install

```bash
npm install @glion/mllp-codec
```

## Use

Frame a message for sending. `frame()` takes encoded bytes — text is encoded upstream, where the message's MSH-18 character-set declaration is visible:

```ts
import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";

const wire = frame(encodeBytes("MSH|^~\\&|...\r")); // Uint8Array: <VT> payload <FS><CR>
```

Unframe a TCP stream where frames span arbitrary chunk boundaries — `unframe()` is the inbound counterpart to `frame()`:

```ts
import { unframe } from "@glion/mllp-codec";

for await (const message of socket.readable.pipeThrough(unframe())) {
  handle(message); // one Uint8Array per complete HL7v2 message
}
```

A protocol violation errors the stream; branch on the typed `code`:

```ts
import { MllpCodecError } from "@glion/mllp-codec";

try {
  for await (const message of socket.readable.pipeThrough(unframe())) {
    handle(message);
  }
} catch (error) {
  if (error instanceof MllpCodecError) {
    // error.code: UNEXPECTED_DATA | INCOMPLETE_MESSAGE |
    //             MESSAGE_TOO_LARGE | RESERVED_CHARACTER
  }
}
```

## API

### `frame(payload): Uint8Array`

Wrap one HL7v2 message in the MLLP envelope. One allocation, one write call at the socket; no shared mutable state. Takes encoded bytes, not text: the codec is content-opaque — it cannot read MSH-18, so it must not choose an encoding either. Encode upstream (`@glion/util-charset`'s `encodeBytes`) and pass the result.

| Parameter | Type         | Description                                                                                                             |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `payload` | `Uint8Array` | The encoded HL7v2 message to wrap. Encode text upstream, where MSH-18 is visible — the codec never chooses an encoding. |

**Returns** — a fresh `Uint8Array` of `<VT> payload <FS><CR>`. Each call allocates its own array; callers may mutate or transfer it.

**Throws** — `MllpCodecError` with code `RESERVED_CHARACTER` when the message contains a VT or FS byte. MLLP reserves those as message boundaries and has no escape mechanism, so `frame` refuses at the source instead of desynchronising the receiver — the injection defence for messages carrying caller-controlled content. CR is allowed; HL7v2 uses it as the segment terminator.

### `unframe(options?): TransformStream<Uint8Array, Uint8Array>`

The inbound counterpart to `frame()`: pipe the wire's byte stream through it and read complete MLLP payloads — one HL7v2 message per chunk out, with partial and coalesced frames reassembled across reads. The scan is amortised O(N) in total bytes regardless of chunking: a 1-byte trickle and 64 KiB socket reads cost the same per byte.

Create one instance per connection: a `TransformStream` locks once piped and is not reusable. On a protocol violation the stream errors with an `MllpCodecError` — and, per Web Streams semantics, messages decoded but not yet read are discarded with the queue: an erroring stream delivers nothing further. Treat a protocol violation as connection-fatal (both glion runtimes do).

| Option             | Type     | Default             | Description                                                                                                                                                                                                                                                                                                         |
| ------------------ | -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxBufferedBytes` | `number` | `16777216` (16 MiB) | Cap on bytes buffered for the in-progress message; exceeding it errors the stream with `MESSAGE_TOO_LARGE`. Enforced as bytes arrive, so it also bounds carried-over bytes plus one inbound chunk — a custom cap must leave room for the largest single chunk the socket can deliver, not just the largest message. |

**Stream errors** — all are `MllpCodecError`; branch on `code`:

- `UNEXPECTED_DATA` — bytes arrived outside of any message envelope (the next message must begin with VT).
- `RESERVED_CHARACTER` — a VT appeared inside an unterminated message, the moment it arrives. Messages can never glue: a remote system that stalls mid-message and then starts its next one fails loudly instead of fusing two messages into one payload.
- `INCOMPLETE_MESSAGE` — the byte stream ended in the middle of a message.
- `MESSAGE_TOO_LARGE` — the `maxBufferedBytes` cap was exceeded.

An embedded lone FS (not followed by CR) is **not** an error — it is treated as message content, matching Mirth Connect and HAPI. See [Protocol notes](#protocol-notes).

### `MllpCodecError`

The one error type this package raises. Extends `Error`; `name` is `"MllpCodecError"`. Branch on `code` — the codes are mutually exclusive, so a `switch` never needs context to disambiguate. The `message` states the observed fact (with a stream-absolute byte offset where one exists); the interpretations live in the table below.

| Code                 | Raised by | What happened                                     | Typical causes                                                                                                                                                          |
| -------------------- | --------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UNEXPECTED_DATA`    | `unframe` | Data arrived outside of any message envelope.     | The remote system is not speaking MLLP on this socket: a TLS/plain-text mismatch, an HTTP health probe, or stream desync after a partial read.                          |
| `INCOMPLETE_MESSAGE` | `unframe` | The byte stream ended in the middle of a message. | The connection was cut mid-transmission — remote crash, network drop, or a middlebox idle timeout.                                                                      |
| `MESSAGE_TOO_LARGE`  | `unframe` | An inbound message exceeded `maxBufferedBytes`.   | A message legitimately larger than the cap, or an unterminated frame accumulating bytes forever — the cap is the backstop for both.                                     |
| `RESERVED_CHARACTER` | both      | A VT or FS byte appeared inside message content.  | Outbound: application content carrying raw control bytes (MLLP cannot escape them). Inbound: a remote system started a new message before terminating the previous one. |

### `MllpCodecErrorCode`

The `code` values as a const object and union type — use it to `switch` exhaustively:

```ts
import { MllpCodecErrorCode } from "@glion/mllp-codec";

if (error.code === MllpCodecErrorCode.MESSAGE_TOO_LARGE) {
  // raise maxBufferedBytes, or fix the sender
}
```

### `VT`, `FS`, `CR`

The MLLP byte constants, exported for tests and tooling that build or inspect wire bytes by hand:

| Constant | Byte   | MLLP role                                                                     |
| -------- | ------ | ----------------------------------------------------------------------------- |
| `VT`     | `0x0B` | Start of a message envelope                                                   |
| `FS`     | `0x1C` | End of message content (first byte of the terminator)                         |
| `CR`     | `0x0D` | Second byte of the terminator; also HL7v2's segment terminator inside content |

## Protocol notes

This package implements MLLP Release 1 (HL7v2 Transport Specification §2.3.1). MLLP Release 2 (commit acknowledgements) and HL7-over-HTTP are out of scope.

MLLP has **no escape mechanism** — VT and FS cannot appear inside a message, and the codec enforces that boundary from both directions:

- **Outbound, strict.** `frame()` rejects any VT or FS in the message (`RESERVED_CHARACTER`), at the source, before anything is written.
- **Inbound, strict on VT.** A VT inside an unterminated message errors the stream the moment it arrives — messages can never glue into one payload.
- **Inbound, lenient on lone FS.** An FS _not_ followed by CR is accepted as message content, matching Mirth Connect and HAPI. An FS immediately followed by CR always reads as the terminator — that ambiguity is inherent to MLLP, and is exactly why `frame()` refuses FS on the way out.
- **An empty message is a valid frame.** `<VT><FS><CR>` round-trips as a zero-length payload.
- **Inter-frame bytes are an error, not noise.** The MLLP receiver algorithm permits skipping bytes until the next VT; this codec deliberately errors instead (`UNEXPECTED_DATA`) — on a request/response wire, inter-frame garbage means desync or a non-MLLP speaker, and skipping it silently would mask both. HAPI's strict mode makes the same call.

### Character sets

This codec never decodes content — it scans raw bytes for VT and FS. That scan is exact for UTF-8 and single-byte charsets (ISO-8859-x, Windows-1252): in UTF-8 the byte values `0x0B` / `0x1C` can never occur inside a multi-byte sequence, so a match is always a real control character. UTF-16-family encodings are not MLLP-safe at all — their code units legitimately contain those byte values, so the protocol itself cannot delimit such content; encode to UTF-8 (or a single-byte charset) before framing.

Character-set conversion of message content is the layer above, owned by [`@glion/util-charset`](https://github.com/rethinkhealth/glion/tree/main/packages/util-charset): `unframe` hands you message bytes, `decodeBytes` turns them into text. Outbound mirrors it exactly — `encodeBytes` turns text into bytes, `frame` wraps them. The codec accepts and emits only bytes, so no path to the wire can bypass the charset layer.

## Part of Glion

`@glion/mllp-codec` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
