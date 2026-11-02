# @glion/hl7v2

Pre-configured `unified` processor that parses, annotates, lints, and serializes HL7v2 messages.

## What it does

`@glion/hl7v2` exports `parseHL7v2`, a frozen `unified` processor assembled from the Glion plugin set. Feeding it an HL7v2 string returns a `VFile` whose `result` is the JSON serialization, whose `tree` is the transformed AST, and whose `messages` list holds every lint diagnostic gathered along the way. Use it when you want the full pipeline; reach for individual plugins when you need a different composition.

## Install

```bash
npm install @glion/hl7v2
```

## Use

```ts
import { parseHL7v2 } from "@glion/hl7v2";

const file = await parseHL7v2.process(
  "MSH|^~\\&|SENDER||RECEIVER||20241201||ADT^A01|MSG123|P|2.5\rPID|1||12345"
);

console.log(file.messages); // lint diagnostics (warnings + errors)
console.log(String(file)); // JSON output
```

The processor is frozen. To extend it, call `.use(...)` on a fresh `unified()` instance composed of the plugins you need.

## API

### `parseHL7v2`

The frozen processor exported by this package. Its type is `Processor<Root, Root, Root, Root, string>` — it parses strings into an HL7v2 AST (`Root`), transforms the tree, and compiles it back to a JSON string via `@glion/jsonify`.

```ts
import type { Processor } from "unified";
import type { Root } from "@glion/ast";

export const parseHL7v2: Processor<Root, Root, Root, Root, string>;
```

Common methods inherited from `unified`:

| Method                       | Description                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `parseHL7v2.process(input)`  | Parse, transform, and compile. Returns a `Promise<VFile>`.                   |
| `parseHL7v2.parse(input)`    | Parse only. Returns a `Root` AST without running transforms or the compiler. |
| `parseHL7v2.run(tree)`       | Run the transform phase on a pre-parsed tree. Returns a `Promise<Root>`.     |
| `parseHL7v2.stringify(tree)` | Compile a tree to the JSON output without re-running transforms.             |

### AST

The syntax tree produced by `parseHL7v2` is defined in [`@glion/ast`](../ast/). Every node is a `unist` node; see the AST README for the full hierarchy.

## Pipeline

`parseHL7v2` composes five plugins in this order (see `packages/hl7v2/src/index.ts`):

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";
import hl7v2PresetLintRecommended from "@glion/preset-lint-recommended";
import hl7v2PresetLintProfileRecommended from "@glion/preset-lint-profile-recommended";
import { hl7v2Jsonify } from "@glion/jsonify";

export const parseHL7v2 = unified()
  .use(hl7v2Parser)
  .use(hl7v2PresetLintRecommended)
  .use(hl7v2PresetLintProfileRecommended)
  .use(hl7v2Jsonify)
  .freeze();
```

| Stage                               | Package                                  | What it contributes                                                                                |
| ----------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `hl7v2Parser`                       | `@glion/parser`                          | Tokenizes HL7v2 text into a `Root` AST following the `@glion/ast` spec, decoding escape sequences. |
| `hl7v2PresetLintRecommended`        | `@glion/preset-lint-recommended`         | Applies the general lint rule set (structural checks, required segments, version).                 |
| `hl7v2PresetLintProfileRecommended` | `@glion/preset-lint-profile-recommended` | Applies profile-aware lint rules (field definitions, datatypes, table values).                     |
| `hl7v2Jsonify`                      | `@glion/jsonify`                         | Compiles the transformed tree to the simplified JSON representation.                               |

To build your own pipeline, import the plugins directly and compose them on a fresh `unified()` instance.

## Custom pipelines

```ts
import { unified } from "unified";
import { hl7v2Parser } from "@glion/parser";
import { hl7v2ToHl7v2 } from "@glion/to-hl7v2";

// Parse-and-reserialize (round-trip)
const roundtrip = unified().use(hl7v2Parser).use(hl7v2ToHl7v2).freeze();
```

Any `unified` plugin that operates on the `@glion/ast` tree can be slotted in — custom lints, annotators, transformers, or alternative compilers like `@glion/to-hl7v2`.

## Part of Glion

`@glion/hl7v2` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
