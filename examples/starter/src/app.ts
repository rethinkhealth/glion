import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

const app = new Mllp();

app.parser(parseHL7v2);

// One route: accept ADT^A01 (patient admit). ctx.ack() replies AA
// (Application Accept); any other message type is rejected with AR.
app.on("ADT^A01", (ctx) => ctx.ack());

export default app;
