---
"@glion/profiles": minor
---

The bundled fields, datatypes, tables, and UTG code systems are JSON, one file per profile, and the event maps and segments one JSON file per HL7v2 version. The build groups the profiles of each version and kind into chunks of about 100 kB of data, and a profile loads only its own chunk the first time it is requested. Importing the package loads 10.8 kB (brotli), down from 33.1 kB.

Regenerating the data also brings two corrections: fields no longer reference the placeholder table `HL79999` ("no table for CE" in the HL7 database), and table 0211 and UTG code system `v2-0211` list `ASCII` where they listed `ascii`.

`loadSegments(version)` gives each segment the name HL7 gives it in that version, in title case, where every version shared one title. Segments HL7 renamed change with it: `AIS` is "Appointment Information - Service" in 2.3 and 2.4 and "Appointment Information" from 2.5, and `ORG` is "Practitioner Organization Unit" from 2.4. `OM6` joins the segments of 2.5 and later, and `EQL`, `ERQ`, `ORO`, `QRD`, `QRF`, `RX1`, `SPR`, and `VTQ` have their names in place of their IDs.

A message code and trigger event that join to an `Object.prototype` key, such as `resolveMessageStructure("2.5", "_", "proto__")`, now resolve to `undefined`, where they returned `Object.prototype`.
