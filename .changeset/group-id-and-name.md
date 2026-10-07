---
"@glion/ast": minor
"@glion/builder": minor
"@glion/profiles": minor
"@glion/transform-profile-groups": minor
"@glion/util-query": minor
"@glion/jsonify": minor
---

A segment group carries an `id` and a `name`. The `id`, such as `PATIENT_VISIT`, holds only uppercase letters, digits, and `_`, and is what a path names the group by. The `name` is the group name for display, in title case with abbreviations spelled out, such as `Patient Visit` or `Master File Test Battery Detail`.

The bundled event schemas replace the group IDs the HL7 XML schemas invent for groups some versions leave unnamed, such as `PIDNTE_SUPPGRP` in v2.5.1 `ORF_R04`, with the ID the nearest version gives the same segments (`PATIENT`), and spell `TIIMING`, `RSPONSE`, and `DEFINTION` as `TIMING`, `RESPONSE`, and `DEFINITION`. Paths that named those IDs change with them.

**Breaking:** the event schema JSON Schema's `$id`, which every bundled schema names in `$schema`, is `https://glion.dev/schemas/event-schema/v2.json`. A `group` element of an event schema requires `id` as well as `name`, and the JSON Schema requires the `[A-Z][A-Z0-9_]*` pattern of the `id`, not the `name`. `runner` throws for a group with no ID. `GroupMatch` and the AST `Group` carry `id` and `name`, and `@glion/transform-profile-groups` sets both. `@glion/util-query` matches a group in a path by its `id`, and `format` writes the `id`. `@glion/jsonify` writes a group's `id` in `group` and adds its `name`. `@glion/builder`'s `g()` takes a string, used as both the ID and the name, or `{ id, name }`.
