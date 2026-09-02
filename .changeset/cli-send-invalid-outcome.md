---
"@glion/cli": patch
---

`glion send` now reports an unsendable message — one with no MSH-10 control ID, or with a reserved VT/FS byte in its serialized text — as the `invalid` outcome kind (previously `transport`). The exit code stays 2; JSON consumers switching on `kind` should treat `invalid` as a pre-wire input failure: nothing reached the wire.
