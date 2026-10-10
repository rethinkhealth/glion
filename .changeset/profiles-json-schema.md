---
"@glion/profiles": minor
---

`@glion/profiles/hl7v2.schema.json` is the JSON Schema of every profile file, with `$id` `https://glion.dev/schemas/hl7v2/v1.json` and one definition per kind: `EventSchema`, `EventMap`, `Segments`, `Fields`, `Datatype`, `Table`, and `CodeSystem`. Every bundled file names its definition in `$schema`, such as `https://glion.dev/schemas/hl7v2/v1.json#/definitions/Fields`. It replaces `@glion/profiles/event-schema.schema.json` and the `https://glion.dev/schemas/event-schema/v2.json` schema.
