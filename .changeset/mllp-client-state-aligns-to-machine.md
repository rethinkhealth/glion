---
"@glion/mllp-client": minor
---

`client.state` now reports the connection machine's own phase directly, removing the separate `MllpClientState` vocabulary that had to be hand-mapped from the machine plus two flags.

- `MllpClientState` is now `idle | connecting | connected | backingOff | reconnecting | closed` (the machine's `ConnectionPhase`).
- `ready` and `sending` collapse to `connected`; `closing` collapses to `closed` (a closing client reports `closed` as soon as `close()` is called, while duplex teardown is still awaited).
- "Is a message on the wire right now?" is no longer a polled state; observe it via the forthcoming lifecycle events. `client.connected` (boolean) is unchanged.

This drops the `onWire`/`closing` bookkeeping in the manager so the public state can never drift from the actual lifecycle. `backingOff`/`reconnecting` are unreachable until reconnect is enabled.
