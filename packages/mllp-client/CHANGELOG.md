# @glion/mllp-client

## 0.17.0

### Minor Changes

- 5d65e92: Concurrent `send()` calls now queue in FIFO order and run one at a time instead of throwing `CONCURRENT_SEND` (the code is removed). Adds a `queueDepth` getter; the per-send timeout spans the queue wait, and a connection drop rejects the in-flight send (`DROPPED`) and every queued send (`CLOSED`).
- 58de708: New persistent, single-flight MLLP client for HL7v2. One long-lived connection per instance (`connect()` / `send()` / `close()`), MSA-2↔MSH-10 ACK correlation, and throw-on-NAK via the `@glion/ack` `AckException` family. Client and transport failures surface as a single `MllpClientError` discriminated by `code`. Ships a Node runtime adapter at `@glion/mllp-client/node`.

### Patch Changes

- b3a1921: `connect()` on a closed or closing client now throws `CLOSED` with an actionable message ("construct a new MllpClient") instead of the misleading `ALREADY_CONNECTED`. `ALREADY_CONNECTED` is reserved for the live states (`connecting` / `ready` / `sending`), where the connection can be reused.
- c09d415: Extract the request control ID (MSH-10) via the parser instead of a hand-rolled byte scan, and document the "parsed tree for logic, caller's bytes on the wire" contract for `send()` (a `string`/`Uint8Array` is framed verbatim; a `Root` is serialized with `@glion/to-hl7v2`).
- Updated dependencies [58de708]
- Updated dependencies [58de708]
  - @glion/ack@0.17.0
  - @glion/mllp-transport@0.17.0
  - @glion/ast@0.17.0
  - @glion/parser@0.17.0
  - @glion/to-hl7v2@0.17.0
  - @glion/util-query@0.17.0
