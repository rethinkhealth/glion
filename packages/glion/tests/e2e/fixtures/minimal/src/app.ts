import { Mllp } from "@glion/mllp";

export default new Mllp().parser(parseHL7v2).on("*", (ctx) => ctx.ack());
