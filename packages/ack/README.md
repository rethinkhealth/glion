# @glion/ack

HL7v2 acknowledgment message builder and typed exception classes.

## What it does

`@glion/ack` builds spec-compliant ACK/NAK response ASTs from a parsed HL7v2 message. The `acknowledge()` function accepts an original message `Root` and returns a new `Root` containing an MSH, MSA, and (when an error is supplied) an ERR segment. Typed exception classes (`AckApplicationError`, `AckApplicationReject`, `AckCommitError`, `AckCommitReject`) carry the HL7v2 error code and severity that the response needs, so callers throw semantic errors and the builder renders them as the correct MSA-1 code.

## Install

```bash
npm install @glion/ack
```

## Use

Build a successful acknowledgment (AA):

```ts
import { acknowledge } from "@glion/ack";
import { toHl7v2 } from "@glion/to-hl7v2";

const ack = acknowledge(originalTree);
const raw = toHl7v2(ack);
// MSH|^~\&|RecvApp|RecvFac|SendApp|SendFac|20240115023000||ACK^A01|<auto-id>|P|2.5.1
// MSA|AA|MSG001
```

Build an application error (AE) or reject (AR):

```ts
import {
  acknowledge,
  AckApplicationError,
  AckApplicationReject,
} from "@glion/ack";

const error = new AckApplicationError("Validation failed", {
  errorCode: "207",
  severity: "E",
});

const ack = acknowledge(originalTree, { error });
// MSA|AE|MSG001|Validation failed
// ERR|||207|E
```

The ACK sender (MSH-3/MSH-4) is derived from the original message's MSH-5/MSH-6 by default.

## API

### `acknowledge(origin, options?)`

Builds an ACK/NAK `Root` AST from the original message tree.

| Parameter                   | Type           | Description                                                        |
| --------------------------- | -------------- | ------------------------------------------------------------------ |
| `origin`                    | `Root`         | Parsed AST of the original HL7v2 message                           |
| `options.id`                | `string`       | Custom MSH-10 control ID. Auto-generated via `uid()` when omitted  |
| `options.sending`           | `SendingInfo`  | MSH-3/MSH-4 of the ACK. Defaults to original message's MSH-5/MSH-6 |
| `options.processingId`      | `string`       | MSH-11 processing ID. Defaults to original message's MSH-11        |
| `options.error`             | `AckException` | Sets the MSA-1 code and populates MSA-3 with the error message     |
| `options.includeErrSegment` | `boolean`      | Include ERR segment when an error is provided. Defaults to `true`  |

Returns a `Root` node containing MSH, MSA, and optionally ERR segments.

### Exception classes

```ts
new AckApplicationError(message, { errorCode, severity?, cause? })
new AckApplicationReject(message, { errorCode, severity?, cause? })
new AckCommitError(message, { errorCode, severity?, cause? })
new AckCommitReject(message, { errorCode, severity?, cause? })
```

All four extend `AckException`, which extends `Error`. Pre-configured convenience subclasses are exported for common cases: `ApplicationInternalError` (AE, code 207), `UnsupportedMessageTypeReject` (AR, code 200), `CommitInternalError` (CE, code 207). The standard `cause` option supports error chains.

### `uid(options?)`

Generates a unique identifier suitable for MSH-10 control IDs.

| Parameter        | Type     | Default | Description                      |
| ---------------- | -------- | ------- | -------------------------------- |
| `options.prefix` | `string` | —       | Optional prefix for the ID       |
| `options.size`   | `number` | `20`    | Total length of the generated ID |

### Constants

`AckCode`, `Hl7ErrorCode`, and `Severity` are exported as const objects with the standard HL7v2 enumeration values.

## Acknowledgment codes

HL7v2 distinguishes two levels of acknowledgment — **application** and **commit** — and each has accept, error, and reject variants. The exception class you throw determines MSA-1 directly.

| Class                  | MSA-1 | Meaning                                                                |
| ---------------------- | ----- | ---------------------------------------------------------------------- |
| _(no error)_           | AA    | Application accept. The receiver processed the message.                |
| `AckApplicationError`  | AE    | Application error. Syntactically valid but rejected by business logic. |
| `AckApplicationReject` | AR    | Application reject. The receiver cannot accept the message at all.     |
| `AckCommitError`       | CE    | Commit error (enhanced mode). Persistence or downstream failure.       |
| `AckCommitReject`      | CR    | Commit reject (enhanced mode). Refused at the commit layer.            |

When an exception is passed via `options.error`, its `errorCode` and `severity` populate the ERR segment. The error's `message` populates MSA-3 (text message).

## Part of Glion

`@glion/ack` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
