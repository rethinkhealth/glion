---
"@glion/mllp-client": patch
---

Support Bun and Deno through `nodeSocket`, verified by a conformance suite that runs the `MllpSocket` contract and the client's behaviour over a real socket unchanged on Node, Bun, and Deno.

- Document Bun and Deno in the runtimes table; both use `@glion/mllp-client/node` through their `node:net` compatibility
