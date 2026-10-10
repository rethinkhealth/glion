---
"@glion/profiles": minor
---

`@glion/profiles/hl7v2.schema.json` is the JSON Schema of every profile file, with `$id` `https://glion.dev/schemas/hl7v2/v1.json` and one definition per kind: `EventSchema`, `EventMap`, `Segments`, `Fields`, `Datatype`, `Table`, and `CodeSystem`. Every bundled file names its definition in `$schema`, such as `https://glion.dev/schemas/hl7v2/v1.json#/definitions/Fields`. Its root accepts a file of any kind; `ajv.getSchema("https://glion.dev/schemas/hl7v2/v1.json#/definitions/EventSchema")` selects one kind.

**Breaking:** `@glion/profiles/hl7v2.schema.json` replaces the `@glion/profiles/event-schema.schema.json` export, and bundled event schemas name `https://glion.dev/schemas/hl7v2/v1.json#/definitions/EventSchema` in `$schema` in place of `https://glion.dev/schemas/event-schema/v2.json`.
