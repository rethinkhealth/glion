# @glion/mllp-transport

MLLP byte-level framing codec for HL7v2 (encode/decode VT/FS/CR).

## What it does

`@glion/mllp-transport` handles the wire framing that wraps every HL7v2 message sent over MLLP. The Minimal Lower Layer Protocol envelopes each payload as `<VT> payload <FS><CR>` (`0x0B … 0x1C 0x0D`). This package encodes payloads into that envelope, decodes framed bytes back into payloads, and streams-decodes a TCP byte stream where frames arrive split or batched across chunks.

It is transport-agnostic: it operates on `Uint8Array` bytes and Web Streams, with no socket, runtime, or AST dependency. Framing problems surface as a single typed `FramingError` discriminated by `FramingErrorCode`.

## Install

```bash
npm install @glion/mllp-transport
```

## Use

Frame a payload for sending, and decode a single complete frame:

```ts
import { frame, decode } from "@glion/mllp-transport";

const wire = frame("MSH|^~\\&|...\r"); // Uint8Array: <VT> payload <FS><CR>
const payload = decode(wire); // Uint8Array of the inner payload bytes
```

Decode a TCP stream where frames span arbitrary chunk boundaries:

```ts
import { FrameDecoderStream } from "@glion/mllp-transport";

for await (const payload of socket.readable.pipeThrough(
  new FrameDecoderStream()
)) {
  handle(payload); // one Uint8Array per complete MLLP frame
}
```

For incremental decoding without Web Streams, drive the decoder directly:

```ts
import { createFrameDecoder } from "@glion/mllp-transport";

const decoder = createFrameDecoder();
const err = decoder.push(chunk, (payload) => handle(payload));
if (err) {
  // err is a FramingError; the stream is corrupt past this point
}
```

### Exports

| Export                             | Description                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `VT`, `FS`, `CR`                   | The MLLP framing byte constants (`0x0B`, `0x1C`, `0x0D`)                |
| `frame(payload)`                   | Wrap a payload (`Uint8Array` or `string`) in the MLLP envelope          |
| `decode(input)`                    | Strip the envelope from one complete frame, returning the payload bytes |
| `validate(payload)`                | Throw `FramingError` if a payload contains reserved framing bytes       |
| `createFrameDecoder(opts?)`        | Stateful incremental decoder for streamed/chunked input                 |
| `FrameDecoderStream`               | `TransformStream<Uint8Array, Uint8Array>` wrapper over the decoder      |
| `FramingError`, `FramingErrorCode` | Typed framing error and its discriminant codes                          |

## Part of Glion

`@glion/mllp-transport` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
