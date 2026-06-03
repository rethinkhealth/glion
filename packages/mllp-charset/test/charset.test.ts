// oxlint-disable typescript/no-non-null-assertion
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";
import type { ConnectionInfo } from "@glion/mllp";
import { ackMiddleware } from "@glion/mllp-ack";

import { charsetMiddleware } from "../src/charset";

const MOCK_CONNECTION: ConnectionInfo = {
  id: 1,
  localPort: 2575,
  remoteAddress: "127.0.0.1",
  remotePort: 12_345,
  secure: false,
  state: new Map(),
};

/**
 * Build an ADT^A01 message with the given MSH-18 character set (omitted when
 * undefined).
 */
function adt(charset?: string, version = "2.5.1"): string {
  const msh = [
    "MSH",
    "^~\\&", // MSH-2
    "SendApp", // MSH-3
    "SendFac", // MSH-4
    "RecvApp", // MSH-5
    "RecvFac", // MSH-6
    "20240101120000", // MSH-7
    "", // MSH-8
    "ADT^A01^ADT_A01", // MSH-9
    "MSG001", // MSH-10
    "P", // MSH-11
    version, // MSH-12
    "", // MSH-13
    "", // MSH-14
    "", // MSH-15
    "", // MSH-16
    "", // MSH-17
    charset ?? "", // MSH-18
  ].join("|");
  return [msh, "EVN|A01|20240101120000", "PID|1||12345^^^MRN||Doe^John"].join(
    "\r"
  );
}

function toBytes(message: string): Uint8Array {
  return new TextEncoder().encode(message);
}

/** App with the ack + charset onion (ack outer so a throw becomes a NAK). */
function buildApp() {
  const app = new Mllp().parser(parseHL7v2);
  app.use(ackMiddleware());
  app.use(charsetMiddleware());
  app.on("ADT^A01", () => {
    // Accept — the charset gate runs before this handler.
  });
  return app;
}

async function handle(message: string) {
  const response = await buildApp().handle(
    message,
    toBytes(message),
    MOCK_CONNECTION
  );
  return response;
}

describe("charsetMiddleware", () => {
  it("rejects a non-UTF-8 MSH-18 with an AR NAK and a located ERR segment", async () => {
    const response = await handle(adt("8859/1"));

    expect(response).toBeDefined();
    expect(response!.raw).toContain("MSA|AR|MSG001");
    // ERR-2 locates the error at MSH-18; ERR-3 carries Table 0357 code 102.
    expect(response!.raw).toContain("ERR||MSH^1^18|102|E");
    // ERR-7 diagnostic echoes the offending value.
    expect(response!.raw).toContain("8859/1");
  });

  it("accepts a UTF-8 MSH-18", async () => {
    const response = await handle(adt("UNICODE UTF-8"));

    expect(response).toBeDefined();
    expect(response!.raw).toContain("MSA|AA|MSG001");
  });

  it("accepts a message that omits MSH-18 (implies the ASCII default)", async () => {
    const response = await handle(adt());

    expect(response).toBeDefined();
    expect(response!.raw).toContain("MSA|AA|MSG001");
  });

  it("rejects when any repetition of MSH-18 is non-UTF-8", async () => {
    const response = await handle(adt("UNICODE UTF-8~UNICODE UTF-16"));

    expect(response).toBeDefined();
    expect(response!.raw).toContain("MSA|AR|MSG001");
    expect(response!.raw).toContain("UNICODE UTF-16");
  });

  it("reacts only to charset diagnostics, not to other fatal lint rules", async () => {
    // MSH-12 = "1.0" trips lint-message-version fatally; MSH-18 stays valid, so
    // the charset gate must let the message through.
    const response = await handle(adt("UNICODE UTF-8", "1.0"));

    expect(response).toBeDefined();
    expect(response!.raw).toContain("MSA|AA|MSG001");
  });

  it("propagates the rejection when no ack middleware wraps it", async () => {
    const app = new Mllp().parser(parseHL7v2);
    app.use(charsetMiddleware()); // deliberately no ackMiddleware
    app.on("ADT^A01", () => {
      // Unreachable for a non-UTF-8 message.
    });
    const message = adt("8859/1");

    await expect(
      app.handle(message, toBytes(message), MOCK_CONNECTION)
    ).rejects.toMatchObject({ name: "AckApplicationReject" });
  });
});
