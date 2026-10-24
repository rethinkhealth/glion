import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

import { accept } from "./accept";

const app = new Mllp().parser(parseHL7v2);

app.on("ADT^A01", (ctx) => {
  console.log(`Admission received (message ${ctx.controlId}).`);
  return accept(ctx);
});

app.on("*", (ctx) => {
  console.log(
    `Received ${ctx.messageType}^${ctx.triggerEvent} (message ${ctx.controlId}).`
  );
  return accept(ctx);
});

export default app;
