import {
  AckApplicationError,
  AckException,
  Hl7ErrorCode,
  UnsupportedMessageTypeReject,
} from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import { value } from "@glion/util-query";

import { acknowledge } from "./acknowledgment";
import { validate } from "./validation";

// Patients by PID-3.1. In memory, so it empties whenever the server restarts,
// and on every reload under `glion dev`.
const admitted = new Set<string>();

const app = new Mllp().parser(parseHL7v2);

// A handler that returns without a reply of its own is answered `AA`.
app.use(async (ctx, next) => {
  await next();
  ctx.res ??= acknowledge(ctx);
});

app.on("ADT^A01", async (ctx) => {
  const tree = await validate(ctx);
  const patient = value(tree, "PID.3.1")?.value;
  if (patient) {
    admitted.add(patient);
  }
});

app.on("ORU^R01", async (ctx) => {
  const tree = await validate(ctx);
  const patient = value(tree, "PID.3.1")?.value;
  if (!(patient && admitted.has(patient))) {
    throw new AckApplicationError("The patient is not on file.", {
      errorCode: Hl7ErrorCode.UnknownKeyIdentifier,
    });
  }
  // Store the results here.
});

app.on("*", () => {
  throw new UnsupportedMessageTypeReject(
    "The message type is not one this server receives."
  );
});

// Every throw, from any handler or middleware, is answered with a NAK here.
app.onError((failure, ctx) => {
  if (!(failure instanceof AckException)) {
    console.error(`Message ${ctx.controlId} could not be processed.`, failure);
  }
  return acknowledge(ctx, failure);
});

export default app;
