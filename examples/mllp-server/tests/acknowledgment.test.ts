import { AckApplicationError } from "@glion/ack";
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { ConnectionInfo } from "@glion/mllp";
import { describe, expect, it } from "vitest";

import { acknowledge } from "../src/acknowledgment";

const connection: ConnectionInfo = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 50_000,
  secure: false,
  state: new Map(),
};

const admission = [
  "MSH|^~\\&|ADMISSIONS^1.2.3^ISO|BARNES\\T\\JEWISH|GLION|GLION|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1",
  "PID|1||123456^^^GENERAL_HOSPITAL^MR||DOE^JOHN",
].join("\r");

const segments = (raw: string | undefined) => raw?.split("\r") ?? [];

describe("acknowledge", () => {
  it("sends the acknowledgment back to the sending application and facility", async () => {
    const app = new Mllp()
      .parser(parseHL7v2)
      .on("*", (ctx) => acknowledge(ctx));

    const reply = await app.handle(admission, new Uint8Array(), connection);
    const [header, msa] = segments(reply?.raw);

    expect(header).toMatch(
      /^MSH\|\^~\\&\|GLION\|GLION\|ADMISSIONS\^1\.2\.3\^ISO\|BARNES\\T\\JEWISH\|\d{14}\+0000\|\|ACK\^A01\^ACK\|[0-9A-Z]{20}\|P\|2\.5\.1$/
    );
    expect(msa).toBe("MSA|AA|MSG001");
  });

  it("answers an error that is not an AckException with AE and a fixed text, keeping its message off the wire", async () => {
    const app = new Mllp()
      .parser(parseHL7v2)
      .on("*", () => {
        throw new Error(
          "connect ECONNREFUSED 10.0.0.5:5432 for patient 123456"
        );
      })
      .onError((failure, ctx) => acknowledge(ctx, failure));

    const reply = await app.handle(admission, new Uint8Array(), connection);

    expect(segments(reply?.raw).slice(1)).toEqual([
      "MSA|AE|MSG001|Application internal error",
      "ERR|||207^^HL70357|E",
    ]);
  });

  it("writes the delimiters and segment terminators in a NAK's text as escape sequences", async () => {
    const app = new Mllp()
      .parser(parseHL7v2)
      .on("*", () => {
        throw new AckApplicationError("Ward 4|B is closed.\rPID|1||0", {});
      })
      .onError((failure, ctx) => acknowledge(ctx, failure));

    const reply = await app.handle(admission, new Uint8Array(), connection);

    expect(segments(reply?.raw).slice(1)).toEqual([
      "MSA|AE|MSG001|Ward 4\\F\\B is closed.\\.br\\PID\\F\\1\\F\\\\F\\0",
      "ERR|||207^^HL70357|E",
    ]);
  });
});
