---
"@glion/mllp-client": minor
---

Prepare `@glion/mllp-client` for public release with two structural changes:

**Naming consistency**

Rename two public symbols so every exported identifier is prefixed with `MllpClient` and reads unambiguously when imported in isolation:

- `ClientTlsOptions` → `MllpClientTlsOptions`
- `ClientErrorCode` → `MllpClientErrorCode`

The class (`MllpClient`), the options (`MllpClientOptions`), and the error class (`MllpClientError`) already followed this convention; the two stragglers now match. `Acknowledgment` keeps its package-agnostic name because it describes the entity itself, not a `MllpClient`-bound configuration.

**Internal/public separation**

Split the 700-line `client.ts` into a small public layer and a focused `internal/` directory. `client.ts` now holds only the `MllpClient` class and its public option types; the socket lifecycle, exchange pipeline, deadline primitive, and run-once guard each live in their own internal module:

```
src/
  index.ts              public exports
  client.ts             MllpClient + public option types        (~245 lines)
  errors.ts             MllpClientError + MllpClientErrorCode
  acknowledgment.ts     Acknowledgment + parseAck/throwOnNak
  internal/
    socket.ts           openConnection + mapSocketError + destroySocket
    exchange.ts         exchange + writeFrame + readFirstFrame + encodeOrThrow
    deadline.ts         Deadline + createDeadline
    run-once.ts         makeRunOnce
```

The public package surface is unchanged in shape — the same set of symbols is still re-exported from `index.ts` — but the file layout makes it easier to evolve the internals without touching the public file, and makes it obvious which modules are not part of the API.
