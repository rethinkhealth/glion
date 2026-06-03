import {
  AckApplicationError,
  AckCode,
  AckException,
  Hl7ErrorCode,
  Severity,
  UnsupportedMessageTypeReject,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { ackMiddleware } from "@glion/mllp-ack";
import { charsetMiddleware } from "@glion/mllp-charset";
import { consola } from "consola";

const app = new Mllp();

// Define the parser
app.parser(parseHL7v2);

// ackMiddleware turns handler return values into AA ACKs and handler
// throws into the matching NAK (AE/AR/CE/CR + ERR segment).
app.use(ackMiddleware());

// Per-message logging middleware — illustrates the onion model:
// run before, await next(), run after.
app.use(async (ctx, next) => {
  const log = consola.withTag(ctx.controlId);
  log.info(
    `← ${ctx.messageType}^${ctx.triggerEvent} from ${ctx.connection.remoteAddress}`
  );

  try {
    await next();
    log.success(`→ ${AckCode.ApplicationAccept}`);
  } catch (error) {
    const code = error instanceof AckException ? error.code : "AE";
    const reason = error instanceof Error ? error.message : String(error);
    log.error(`→ ${code} ${reason}`);
    throw error;
  }
});

// Strict mode: reject inbound messages whose MSH-18 character set is not
// UTF-8-compatible with an AR NAK, before any route runs. The allow-list lives
// with the `@glion/lint-charset` rule (error severity in the recommended
// preset, which `parseHL7v2` uses).
app.use(charsetMiddleware());

// Routes
app.on("ADT^A01", (ctx) => {
  consola.withTag(ctx.controlId).info("Patient admit processed");
});

app.on("ORM^O01", (ctx) => {
  consola.withTag(ctx.controlId).info("Order received");
});

// Throwing an AckException turns into the matching NAK on the wire.
app.on("ORU^R01", () => {
  throw new AckApplicationError("Patient not available", {
    errorCode: Hl7ErrorCode.UnsupportedMessageType,
    severity: Severity.Error,
  });
});

// Catch-all — reject anything we didn't register a route for.
app.on("*", (ctx) => {
  throw new UnsupportedMessageTypeReject(
    `Unsupported message type: ${ctx.messageType}^${ctx.triggerEvent}`
  );
});

export default app;
