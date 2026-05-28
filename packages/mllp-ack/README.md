# @glion/mllp-ack

MLLP middleware that generates HL7v2 acknowledgments automatically from handler outcomes.

## What it does

`@glion/mllp-ack` exports `ackMiddleware()`, a middleware for `@glion/mllp` that wraps your route handlers and produces an ACK/NAK response for every accepted message. When a handler returns without throwing, the middleware emits an AA (or a configurable success code such as CA for commit-level acknowledgments). When a handler throws an `AckException` from `@glion/ack`, the middleware translates it into the matching AE/AR/CE/CR response with an ERR segment. Plain `Error` values become `ApplicationInternalError` (AE, error code 207), so routes that forget to handle a failure still produce a valid NAK instead of silence.

## Install

```bash
npm install @glion/mllp-ack
```

The package has a peer dependency on `@glion/mllp`.

## Use

```ts
import { Mllp } from "@glion/mllp";
import { serve } from "@glion/mllp/node";
import { parseHL7v2 } from "@glion/hl7v2";
import { ackMiddleware } from "@glion/mllp-ack";

const app = new Mllp().parser(parseHL7v2);

app.use(ackMiddleware());

app.on("ADT^A01", async (ctx) => {
  // Process the message; no return needed — middleware sends AA automatically.
});

const server = serve(app, { port: 2575 });
```

Throw a typed exception to produce a NAK:

```ts
import {
  AckApplicationError,
  Hl7ErrorCode,
  Severity,
  UnsupportedMessageTypeReject,
} from "@glion/ack";

app.on("ADT^A01", async (ctx) => {
  const patient = await findPatient(ctx);
  if (!patient) {
    throw new AckApplicationError("Patient not found", {
      errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
      severity: Severity.Error,
    });
  }
});

app.on("*", async (ctx) => {
  throw new UnsupportedMessageTypeReject(
    `Unsupported: ${ctx.messageType}^${ctx.triggerEvent}`
  );
});
```

For enhanced-mode processing, switch the success code to CA and use commit-level exceptions:

```ts
import { AckCode, AckCommitError, Hl7ErrorCode, Severity } from "@glion/ack";

app.use(ackMiddleware({ successCode: AckCode.CommitAccept }));

app.on("ADT^A01", async (ctx) => {
  try {
    await persistMessage(ctx);
  } catch (err) {
    throw new AckCommitError("Failed to persist message", {
      errorCode: Hl7ErrorCode.ApplicationInternalError,
      severity: Severity.Error,
      cause: err,
    });
  }
});
```

## API

### `ackMiddleware(options?)`

Returns a `Middleware` function for use with `Mllp.use()`.

| Option        | Type             | Description                                                          |
| ------------- | ---------------- | -------------------------------------------------------------------- |
| `sending`     | `SendingInfo`    | MSH-3/MSH-4 of the ACK. Defaults to original message's MSH-5/MSH-6   |
| `generateId`  | `() => string`   | Custom ID generator for MSH-10. Uses `uid()` from `@glion/ack`       |
| `successCode` | `AckSuccessCode` | MSA-1 code for success. Defaults to `AckCode.ApplicationAccept` (AA) |

### Exception classes

| Class                          | MSA-1 | Description                                |
| ------------------------------ | ----- | ------------------------------------------ |
| `AckApplicationError`          | AE    | Application-level error                    |
| `AckApplicationReject`         | AR    | Application-level reject                   |
| `AckCommitError`               | CE    | Commit-level error                         |
| `AckCommitReject`              | CR    | Commit-level reject                        |
| `ApplicationInternalError`     | AE    | Pre-configured: error code 207, severity E |
| `UnsupportedMessageTypeReject` | AR    | Pre-configured: error code 200, severity E |
| `CommitInternalError`          | CE    | Pre-configured: error code 207, severity E |

All exception classes are re-exported from `@glion/ack`.

## Behavior

### Handler outcome to MSA-1 mapping

| Handler outcome                         | MSA-1          | ERR segment |
| --------------------------------------- | -------------- | ----------- |
| returns (no throw)                      | `successCode`  | no          |
| throws `AckApplicationError`            | AE             | yes         |
| throws `AckApplicationReject`           | AR             | yes         |
| throws `AckCommitError`                 | CE             | yes         |
| throws `AckCommitReject`                | CR             | yes         |
| throws a plain `Error` or non-`Error`   | AE (code 207)  | yes         |
| handler set `ctx.res` and did not throw | passed through | —           |

If `ctx.res` was already set by a handler and nothing threw, the middleware leaves it untouched.

### `ctx.ast` vs `ctx.tree()`

The middleware reads `ctx.ast` — the raw parsed tree — rather than `await ctx.tree()`. `acknowledge()` only needs the MSH header fields (MSH-3 through MSH-12), which are already present in the pre-transform tree. Avoiding `ctx.tree()` means the transform pipeline (escape decoding, annotations, lint) is not triggered for ACK construction, so the middleware adds zero async overhead. If you write custom ACK middleware, follow the same pattern.

### Interaction with `onError`

The middleware catches handler errors and converts them into ACK responses. If ACK construction itself fails (for example, a malformed AST or a serialization error), the error propagates to the `Mllp` instance's `onError` handler as an infrastructure-level safety net.

## Part of Glion

`@glion/mllp-ack` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
