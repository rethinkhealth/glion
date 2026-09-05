---
"@glion/profiles": patch
---

Fixed the post-choice `ORC` transition's `groupsClosed` effect in the `PPP_PCB` and `PPG_PCG` profile automata (all versions that have the `ORDER_DETAIL/CHOICE` subtree: v2.3.1, v2.4, v2.5, v2.6, v2.7, v2.7.1, v2.8, v2.8.1, v2.8.2). At the state reached after `OBR` opens `ORDER_DETAIL/CHOICE` (and before any `OBX` opens `ORDER_OBSERVATION`), `ORC` now closes `…/ORDER_DETAIL/CHOICE` — the leaf that is actually open — matching every sibling transition at that state. It previously closed `…/ORDER_DETAIL/ORDER_OBSERVATION`, which is not open at that state (it is only open at the later post-observation states, whose `ORC` transitions already closed it correctly). `groupsOpened` (`…/ORDER`) is unchanged. The `effects` metadata is optional and no in-repo consumer currently reads it, so this is a latent data-quality fix for future higher-level consumers that interpret `groupsOpened`/`groupsClosed`.
