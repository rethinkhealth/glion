# @glion/to-fhir

Compile an HL7v2 message into FHIR resources.

The plugin is a `unified` compiler: the Bundle lands on `file.result`, every
finding on `file.messages`, and the provenance of every element written on
`file.data`.

## Install

```sh
npm install @glion/to-fhir
```

## Use

```typescript
import { hl7v2AnnotateProfileContext } from "@glion/annotate-profile-context";
import { hl7v2AnnotateProfileFields } from "@glion/annotate-profile-fields";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToFhir, oruR01 } from "@glion/to-fhir";
import { hl7v2TransformProfileGroups } from "@glion/transform-profile-groups";
import { unified } from "unified";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2AnnotateProfileContext)
  .use(hl7v2AnnotateProfileFields)
  .use(hl7v2TransformProfileGroups)
  .use(hl7v2ToFhir, { schema: oruR01 })
  .process(message);

file.result; // the FHIR Bundle
file.messages; // every finding
file.data.provenance; // every element written, and the leaf behind it
file.data.fhirCoverage; // { populated, read, consulted, unmapped, resources }
```

`hl7v2ToFhir` reads group membership and field sequence numbers from the tree,
so `hl7v2TransformProfileGroups` and `hl7v2AnnotateProfileFields` MUST run
before it.

## What it maps

`oruR01` maps PID and PV1 of an ORU^R01 to a US Core Patient and a US Core
Encounter, against FHIR R4 and HL7v2 2.5.1.

| Segment map      | FHIR resource | Reads                              |
| ---------------- | ------------- | ---------------------------------- |
| `PID[Patient]`   | Patient       | PID-3, PID-5, PID-7, PID-8, PID-11 |
| `PV1[Encounter]` | Encounter     | PV1-2, PV1-19, PV1-44, PV1-45      |

A schema names its own segment maps, datatype tables and concept maps, and is
checked before it reads a message:

```typescript
import { assertSchema } from "@glion/to-fhir";

assertSchema(mySchema);
```

## Findings

Every finding carries a `ruleId`, the source `glion-to-fhir`, and the position
of the field it was found in.

| `ruleId`                    | Reports                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| `fhir-unmapped-field`       | A populated field of a mapped segment that no element reads.        |
| `fhir-unmapped-segment`     | A segment the schema has no segment map for, and its value count.   |
| `fhir-terminology-gap`      | A code the concept map declines, requires an error for, or lacks.   |
| `fhir-conversion-failure`   | A value a date or date/time conversion cannot read.                 |
| `fhir-unresolved-reference` | A reference to a slot no resource in an enclosing group fills.      |
| `fhir-duplicate-anchor`     | A second anchor segment in one group instance.                      |
| `fhir-scope-absent`         | An anchor segment the message carries outside the group it maps in. |

Every populated field is read into FHIR, read to decide a condition, or
reported. MSH-1 and MSH-2 carry the delimiters and are not counted.

## Not yet mapped

PID-13 (Phone Number - Home), CX-4 (Assigning Authority) and PV1-7 (Attending
Doctor) are reported rather than written: they need a ContactPoint whose value
HL7v2 splits across components, and Organization and Practitioner resources
this package does not create.

## Part of Glion

`@glion/to-fhir` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme

## License

MIT
