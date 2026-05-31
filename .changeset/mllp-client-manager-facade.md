---
"@glion/mllp-client": patch
---

Internal refactor: split the orchestration out of the `MllpClient` class into a `createConnectionManager()` factory (`manager.ts`). The class is now a thin facade — it provides `instanceof`/constructor semantics and the stable method surface, and delegates `connect`/`send`/`close`/getters to the manager, which owns the state machine, the send queue + drain loop, the dial routine, and the per-connection wire layer. Functional-over-class internals per the project's design philosophy. No public API or behaviour change; the full test suite is unchanged and green.
