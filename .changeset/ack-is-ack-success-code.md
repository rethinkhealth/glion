---
"@glion/ack": minor
---

Add `isAckSuccessCode`, the accept half of the Table 0008 guards. The package exported the `AckSuccessCode` type but only `isAckCode` and `isAckNakCode`, so narrowing a string to an accept meant composing the two.
