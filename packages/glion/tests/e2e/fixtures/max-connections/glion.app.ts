import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

export default new Mllp().parser(parseHL7v2);
