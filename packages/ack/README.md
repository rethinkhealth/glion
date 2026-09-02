# @glion/ack

Typed HL7v2 acknowledgment codes and exceptions.

## What it does

`@glion/ack` gives you typed exceptions and constants for HL7v2 acknowledgments. Instead of comparing raw strings like `"AE"` or `"207"`, you throw and catch real error classes and use named constants.

- **One class per rejection code.** Throw `AckApplicationError` for AE, `AckApplicationReject` for AR, `AckCommitError` for CE, `AckCommitReject` for CR.
- **Named constants for the standard tables.** `AckCode`, `Hl7ErrorCode`, and `Severity` replace magic strings, with full TypeScript types.
- **Works on both sides of a connection.** Throw the exceptions in a server to reject a message. Catch them in a client when a remote system rejects yours.

## Install

```bash
npm install @glion/ack
```

## Use

Reject a message from a server handler — the exception carries the acknowledgment code and error data the server renders into the matching NAK:

```ts
import { AckApplicationError, Hl7ErrorCode } from "@glion/ack";

throw new AckApplicationError("Patient 12345 not found", {
  errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
});
```

Handle a rejection from the client — `@glion/mllp-client` throws the same classes when the remote system NAKs:

```ts
import { AckException } from "@glion/ack";

try {
  await client.send(message);
} catch (error) {
  if (error instanceof AckException) {
    // the remote system said no — error.code is AE, AR, CE, or CR
  }
}
```

## API

### Exception classes

```ts
new AckApplicationError(message, options); // AE
new AckApplicationReject(message, options); // AR
new AckCommitError(message, options); // CE
new AckCommitReject(message, options); // CR
```

All four extend `AckException`, which extends `Error`. The `code` property carries the MSA-1 value (`AckNakCode`); `options` is an `AckExceptionOptions`:

| Option      | Type      | Description                                            |
| ----------- | --------- | ------------------------------------------------------ |
| `errorCode` | `string`  | ERR-3 condition code (Table 0357 — see `Hl7ErrorCode`) |
| `severity`  | `string`  | ERR-4 severity (Table 0516 — see `Severity`)           |
| `text`      | `string`  | MSA-3 text message, when derived from a remote NAK     |
| `controlId` | `string`  | MSA-2 control ID, when derived from a remote NAK       |
| `cause`     | `unknown` | Standard error cause                                   |

Three pre-configured subclasses cover common cases:

```ts
new ApplicationInternalError(message, cause?); // AE, code 207
new UnsupportedMessageTypeReject(message); // AR, code 200
new CommitInternalError(message, cause?); // CE, code 207
```

### Type guards

`isAckCode(value)` narrows a string to `AckCode` (any of the six Table 0008 codes). `isAckNakCode(value)` narrows to `AckNakCode` (`AE` / `AR` / `CE` / `CR`); on an `AckCode`, the negative branch narrows to `AckSuccessCode` (`AA` / `CA`).

### Constants

`AckCode`, `Hl7ErrorCode`, and `Severity` are const objects with the standard HL7v2 enumeration values. Each name is also the union type of its values — `const code: AckCode = AckCode.ApplicationAccept`.

## Acknowledgment codes

HL7v2 distinguishes two levels of acknowledgment — **application** and **commit** — and each has accept, error, and reject variants. The exception class determines MSA-1 directly.

| Class                  | MSA-1 | Meaning                                                                |
| ---------------------- | ----- | ---------------------------------------------------------------------- |
| _(no error)_           | AA    | Application accept. The receiver processed the message.                |
| `AckApplicationError`  | AE    | Application error. Syntactically valid but rejected by business logic. |
| `AckApplicationReject` | AR    | Application reject. The receiver cannot accept the message at all.     |
| `AckCommitError`       | CE    | Commit error (enhanced mode). Persistence or downstream failure.       |
| `AckCommitReject`      | CR    | Commit reject (enhanced mode). Refused at the commit layer.            |

When a server renders the response, the exception's `message` becomes MSA-3 text. `errorCode` and `severity` stay data: the application renders them in whatever ERR shape its HL7v2 version requires.

## Part of Glion

`@glion/ack` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
