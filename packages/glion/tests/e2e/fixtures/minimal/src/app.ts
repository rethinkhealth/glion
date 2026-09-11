import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

export default new Mllp().parser(parseHL7v2).on("*", () => ({
  raw: "MSH|^~\\&|X|X|X|X|202604041200||ACK|1|P|2.5.1\rMSA|AA|1\r",
}));
