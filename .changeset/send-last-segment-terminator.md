---
"@glion/mllp-client": patch
"@glion/cli": patch
---

A message is sent with the segment terminator after its last segment, as HL7v2 Chapter 2 requires: the MLLP payload is `MSH|^~\&|…\rPID|1\r`, then the `<FS><CR>` trailer.
