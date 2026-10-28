import { Mllp } from "@glion/mllp";

export default new Mllp().on("*", (ctx) => ctx.ack());
