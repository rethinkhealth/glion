---
"@glion/profiles": minor
---

The bundled profiles are one JSON file per HL7v2 version and kind: `fields.json`, `datatypes.json`, `tables.json`, `structures.json`, and `segments.json` in each version, and `utg/code-systems.json`, 80 files in place of about 10,800. The build ships each as `JSON.parse` of a minified string in its own chunk. Importing the package loads 4.3 kB (brotli), down from 30.6 kB; the first load of a version's fields, tables, or code systems takes 2.5–3.8 ms, down from 9–18 ms; the largest message-structure chunk is 7.0 kB, down from 16.5 kB.

A load that fails, such as a chunk that does not download, is not kept: the next call imports the file again.

**Breaking:** `eventMaps` is a `ReadonlyMap<string, ReadonlyMap<string, string>>`. `eventMaps["2.5"]?.["ADT_A04"]` becomes `eventMaps.get("2.5")?.get("ADT_A04")`; a version or event read from a message no longer reaches `Object.prototype`. The bundled message structures no longer carry `$schema`; each still conforms to `message-structure.schema.json`.

Regenerating the data from the generator also brings two corrections: fields no longer reference the placeholder table `HL79999` ("no table for CE" in the HL7 database), and table 0211 and UTG code system `v2-0211` list `ASCII` where they listed `ascii`.
