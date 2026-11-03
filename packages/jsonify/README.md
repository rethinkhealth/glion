# @glion/jsonify

Serialize an HL7v2 AST into a compact, structured JSON document.

## What it does

`@glion/jsonify` takes an HL7v2 AST — typically produced by `@glion/parser` — and emits a JSON representation that strips `unist` metadata (position, raw, type discriminators) and keeps only the meaningful HL7v2 shape: segment names, field indexes, values, and children. The result is a clean payload for downstream APIs, message queues, and analytics stores that want structured HL7v2 without the parser's internal tree representation.

## Install

```bash
npm install @glion/jsonify
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import { hl7v2Jsonify } from "@glion/jsonify";
import { unified } from "unified";

const msg = `MSH|^~\\&|HIS|RIH|EKG|EKG|200202150930||ADT^A01|MSG00001|P|2.4\rPID|||555-44-4444||DOE^JOHN`;

const file = await unified().use(hl7v2Parser).use(hl7v2Jsonify).process(msg);

console.log(String(file));
```

Yields:

```json
{
  "type": "Message",
  "children": [
    {
      "type": "Segment",
      "name": "MSH",
      "children": [
        { "type": "Field", "name": "MSH-1", "value": "|" },
        { "type": "Field", "name": "MSH-2", "value": "^~\\&" }
      ]
    },
    {
      "type": "Segment",
      "name": "PID",
      "children": [
        { "type": "Field", "name": "PID-3", "value": "555-44-4444" },
        { "type": "Field", "name": "PID-5", "value": "DOE^JOHN" }
      ]
    }
  ]
}
```

## API

### `unified().use(hl7v2Jsonify)`

Register the plugin as the compiler of a `unified` processor. The processor's `process()` call returns a file whose stringified contents is the JSON document. No options.

## JSON shape

Every node in the output has the following shape:

```ts
interface HL7v2JsonNode {
  type: string; // "Message", "Segment", "Field", "Component", ...
  name?: string; // segment name (e.g. "MSH") or field id (e.g. "PID-3")
  index?: number; // positional index where relevant
  value?: string; // leaf value for Field / Component / Subcomponent
  separator?: string; // delimiter character when it is meaningful to preserve
  children?: HL7v2JsonNode[]; // recursive shape for composite nodes
}
```

Only the fields relevant to a given node appear in the output — `Field` nodes carry `name` and `value`, composite nodes carry `name` and `children`, and so on.

## Part of Glion

`@glion/jsonify` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
