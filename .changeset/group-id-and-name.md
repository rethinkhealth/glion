---
"@glion/ast": minor
"@glion/builder": minor
"@glion/profiles": minor
"@glion/transform-profile-groups": minor
"@glion/util-query": minor
"@glion/jsonify": minor
---

A segment group carries an `id` and a `name`. The `id`, such as `PATIENT_VISIT`, holds only uppercase letters, digits, and `_`, and is what a path names the group by. The `name` is the group name as the standard spells it, such as `PATIENT VISIT` in v2.6, and equals the `id` for most groups.

**Breaking:** a `group` element of an event schema requires `id` as well as `name`, and the event schema JSON Schema requires the `[A-Z][A-Z0-9_]*` pattern of the `id`, not the `name`. `runner` throws for a group with no ID. `GroupMatch` and the AST `Group` carry `id` and `name`, and `@glion/transform-profile-groups` sets both. `@glion/util-query` matches a group in a path by its `id`, and `format` writes the `id`. `@glion/jsonify` writes a group's `id` in `group` and adds its `name`. `@glion/builder`'s `g()` takes a string, used as both the ID and the name, or `{ id, name }`.
