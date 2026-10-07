# @glion/lint-message-version

Lint rule that checks an HL7v2 message's `MSH-12` version satisfies a semver range expression.

## What it does

Reads `MSH-12.1` from the tree and evaluates it against the configured `expression` using `@glion/util-semver`. Reports a message when `MSH-12` is missing, when it is empty, when the value is not a valid semver-like version, or when it falls outside the allowed range. The default expression (`"<3.0.0 >=2.3"`) accepts HL7v2 versions 2.3 through 2.9 and excludes future v3 values.

## Install

```bash
npm install @glion/lint-message-version
```

## Use

```ts
import { hl7v2Parser } from "@glion/parser";
import hl7v2LintMessageVersion from "@glion/lint-message-version";
import { unified } from "unified";
import { reporter } from "vfile-reporter";

const message =
  "MSH|^~\\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5";

const file = await unified()
  .use(hl7v2Parser)
  .use(hl7v2LintMessageVersion, { expression: "<3.0.0 >=2.3" })
  .process(message);

console.error(reporter([file]));
```

## API

### `unified().use(hl7v2LintMessageVersion[, options])`

A `unified` lint rule plugin.

```ts
import type { Plugin } from "unified";
import type { Root } from "@glion/ast";

export interface MessageVersionLintOptions {
  /** Semver range expression to evaluate against `MSH-12.1`. Default: "<3.0.0 >=2.3". */
  expression: string;
}

declare const hl7v2LintMessageVersion: Plugin<
  [MessageVersionLintOptions?],
  Root
>;
export default hl7v2LintMessageVersion;
```

Expressions are parsed and evaluated by `@glion/util-semver`.

## What it checks

The value of `MSH-12.1` must be present and must satisfy the configured semver expression.

### Valid

`MSH-12` is `2.5`, within the default range `<3.0.0 >=2.3`:

```hl7
MSH|^~\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.5
```

### Invalid

`MSH-12` is `2.2`, below the default minimum:

```hl7
MSH|^~\&|SENDER|FAC|RCVR|FAC|20250101010101||ADT^A01^ADT_A01|MSG00001|P|2.2
```

Reported message:

```
The version in `MSH-12` (Version ID) is `2.2`; it must satisfy `<3.0.0 >=2.3`.
```

`MSH-12` is missing:

```
The message has no `MSH-12` (Version ID); a message must declare its HL7v2 version.
```

`MSH-12` is present but empty:

```
The version in `MSH-12` (Version ID) is empty; a message must declare its HL7v2 version.
```

`MSH-12` contains a value that cannot be parsed as semver:

```
The version in `MSH-12` (Version ID) is `abc`; a version must be numbers separated by dots, such as `2.5` or `2.5.1`.
```

Each report on a value sets `actual` to that value; a version outside the range also sets `expected` to the configured expression. The rule reports at most one message per tree and exits as soon as the first problem is detected.

## Part of Glion

`@glion/lint-message-version` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
