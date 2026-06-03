# @glion/mllp-charset

MLLP middleware that rejects inbound HL7v2 messages whose `MSH-18` character set is not allowed (UTF-8 by default).

## What it does

The Glion runtime decodes wire bytes as UTF-8 only. `charsetMiddleware()` enforces that contract at the door: it forces the pipeline to run (`await ctx.tree()`), checks for a fatal `MSH-18` charset diagnostic from [`@glion/lint-charset`](../lint-charset#readme), and — when one is present — throws an `AckApplicationReject`. Paired with an acknowledgment middleware, that throw becomes an `AR` NAK with an ERR segment (condition code `102`, data type error), so a non-conforming sender is rejected up front instead of failing deep in the decode path.

The allow-list lives with the rule, not the middleware. Configure [`@glion/lint-charset`](../lint-charset#readme) in your processor (the default UTF-8 allow-list ships in [`@glion/preset-lint-recommended`](../preset-lint-recommended#readme) at `error` severity, which `parseHL7v2` uses). Enforcement only fires when the rule runs at `error` severity; a pipeline that downgrades or omits the rule passes every message through.

## Install

```bash
npm install @glion/mllp-charset
```

## Use

Register it **inside** `ackMiddleware` so a rejection becomes a NAK on the wire:

```typescript
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { ackMiddleware } from "@glion/mllp-ack";
import { charsetMiddleware } from "@glion/mllp-charset";

const app = new Mllp().parser(parseHL7v2);

app.use(ackMiddleware()); // outer: turns thrown rejections into NAKs
app.use(charsetMiddleware()); // inner: rejects non-UTF-8 MSH-18 before routing

app.on("ADT^A01", (ctx) => {
  // Only reached for messages with an allowed character set.
});

export default app;
```

A message declaring `MSH-18 = 8859/1` is answered with:

```
MSH|...|ACK^A01|...
MSA|AR|MSG001|MSH-18 (character set) value '8859/1' is not allowed ...
ERR|||102|E
```

A message declaring `UNICODE UTF-8`, or omitting `MSH-18` entirely, is accepted (`MSA|AA`).

## API

### `charsetMiddleware(): Middleware`

Returns an MLLP `Middleware`. It awaits `ctx.tree()` (running the configured lint rules), then scans `ctx.file.messages` for a fatal message with `source: "hl7v2-lint"` and `ruleId: "charset"` — the constants exported by `@glion/lint-charset` as `HL7V2_LINT_SOURCE` and `CHARSET_RULE_ID`. When found, it throws `AckApplicationReject` (`@glion/ack`) with `errorCode: Hl7ErrorCode.DataTypeError` and `severity: Severity.Error`.

It takes no options: the set of accepted character sets is the rule's concern. To accept additional encodings, reconfigure `@glion/lint-charset` in your processor.

## Part of Glion

`@glion/mllp-charset` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
