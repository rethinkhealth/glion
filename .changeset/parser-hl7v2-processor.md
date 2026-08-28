---
"@glion/parser": minor
"@glion/mllp": patch
---

`Hl7v2Processor` — the unified processor type every HL7v2 pipeline satisfies — is exported from `@glion/parser`, its ecosystem home. `@glion/mllp` re-exports it unchanged. Its head and tail admit `undefined` (`Processor<Root, Root | undefined, Root | undefined>`), so the bare `unified().use(hl7v2Parser).freeze()` is assignable alongside full transformer/compiler pipelines like `@glion/hl7v2`'s `parseHL7v2` — no casts needed. The package's public d.ts types now come from real dependencies (`@glion/ast`, `@glion/config`, `@types/unist` moved into `dependencies`).
