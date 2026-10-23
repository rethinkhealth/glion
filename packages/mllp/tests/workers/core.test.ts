/**
 * The core inside `workerd`: this file runs in the Workers runtime through
 * `@cloudflare/vitest-plugin`, with Node.js compatibility off.
 */

import { parseHL7v2 } from "@glion/hl7v2";
import { frame } from "@glion/mllp-codec";
import { describe, expect, it } from "vitest";

import { handleConnection, Mllp } from "../../src/index";

const ADT =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

const app = new Mllp<{ region: string }>()
  .parser(parseHL7v2)
  .on("ADT^A01", (ctx) => {
    ctx.set("region", ctx.env.region);
  });

describe("@glion/mllp in workerd", () => {
  it("replies AA to a message given to handle()", async () => {
    const reply = await app.handle(new TextEncoder().encode(ADT), {
      region: "north",
    });
    expect(reply?.raw).toContain("\rMSA|AA|MSG001");
  });

  it("replies with MLLP framing on a connection over Web Streams", async () => {
    const inbound = new TransformStream<Uint8Array, Uint8Array>();
    const outbound = new TransformStream<Uint8Array, Uint8Array>();
    const remote = inbound.writable.getWriter();
    const replies = outbound.readable.getReader();

    const closed = handleConnection(
      (payload) => app.handle(payload, { region: "north" }),
      {
        close() {
          // Nothing to end: the test closes the remote side itself.
        },
        readable: inbound.readable,
        writable: outbound.writable,
      }
    );
    await remote.write(frame(new TextEncoder().encode(ADT)));
    const { value } = await replies.read();
    await remote.close();
    await closed;

    const text = new TextDecoder().decode(value);
    expect(text.startsWith("\u000BMSH|")).toBe(true);
    expect(text).toContain("\rMSA|AA|MSG001");
    expect(text.endsWith("\u001C\r")).toBe(true);
  });
});
