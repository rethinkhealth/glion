import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

const app = new Mllp();

app.parser(parseHL7v2);

// One route: accept ADT^A01 (patient admit). Returning nothing replies AA
// (Application Accept); any other message type is rejected with AR.
app.on("ADT^A01", () => {
  // Process the admit here.
});

export default app;
