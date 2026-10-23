import {
  AckApplicationError,
  AckCode,
  Hl7ErrorCode,
  Severity,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { consola } from "consola";

const app = new Mllp();

// Define the parser
app.parser(parseHL7v2);

// Per-message logging middleware — illustrates the onion model:
// run before, await next(), run after. After next(), ctx.res is the reply
// and ctx.error the error the message raised, if any.
app.use(async (ctx, next) => {
  const log = consola.withTag(ctx.controlId);
  log.info(
    `← ${ctx.messageType}^${ctx.triggerEvent} from ${ctx.connection.remoteAddress}`
  );

  await next();

  if (ctx.error) {
    log.error(`→ replied after an error: ${ctx.error.message}`);
  } else if (ctx.res) {
    log.success("→ replied");
  } else {
    log.info("→ no reply");
  }
});

// Returning nothing replies AA (Application Accept).
app.on("ADT^A01", (ctx) => {
  consola.withTag(ctx.controlId).info("Patient admit processed");
});

// ctx.ack() builds the reply; here a CA (Commit Accept).
app.on("ORM^O01", (ctx) => {
  consola.withTag(ctx.controlId).info("Order received");
  return ctx.ack({ code: AckCode.CommitAccept });
});

// Throwing an AckException replies with its code, and its text in MSA-3.
app.on("ORU^R01", () => {
  throw new AckApplicationError("Patient not available", {
    errorCode: Hl7ErrorCode.UnsupportedMessageType,
    severity: Severity.Error,
    text: "Patient not available",
  });
});

// Any other message type is rejected with AR.

export default app;
