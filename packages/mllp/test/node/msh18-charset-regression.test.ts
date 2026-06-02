// oxlint-disable promise/avoid-new
import net from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import { CR, frame, FS } from "@glion/mllp-transport";
import { IncompatibleCharsetError } from "@glion/util-charset";

import { serve } from "../../src/node/serve.js";
import type { Server } from "../../src/node/serve.js";
import { Mllp } from "../../src/server/mllp.js";

/**
 * Regression for https://github.com/rethinkhealth/glion/issues/659.
 *
 * The server decodes each inbound payload as UTF-8 via `decodeBytes(payload)`
 * (from `@glion/util-charset`), fatally. A non-UTF-8 feed (e.g. ISO 8859/1)
 * therefore fails LOUDLY — surfaced through `onError`, with no response —
 * rather than being silently corrupted to U+FFFD and ACKed as if valid, which
 * was the #659 bug.
 *
 * Honouring the charset a message declares in MSH-18 (so such a feed decodes
 * intact instead of erroring) is deferred to
 * https://github.com/rethinkhealth/glion/issues/662.
 */

/** Wait until the server accepts a TCP connection. */
function waitForReady(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const probe = net.connect({ host: "127.0.0.1", port }, () => {
      probe.destroy();
      resolve();
    });
    probe.on("error", reject);
  });
}

/**
 * Frame and send RAW bytes (not a string — the harness must control the wire
 * encoding to feed a Latin-1 body), then resolve once a complete MLLP response
 * frame has arrived.
 */
function sendBytes(
  port: number,
  payload: Uint8Array,
  timeoutMs = 5000
): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const client = net.connect({ host: "127.0.0.1", port }, () => {
      client.write(frame(payload));
    });

    const chunks: Buffer[] = [];
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
      }
    }, timeoutMs);

    client.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      const combined = Buffer.concat(chunks);
      if (
        combined.length >= 3 &&
        combined.at(-2) === FS &&
        combined.at(-1) === CR
      ) {
        resolved = true;
        clearTimeout(timer);
        client.destroy();
        resolve(combined);
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });
  });
}

describe("non-UTF-8 feed is rejected loudly, not silently corrupted (regression for #659)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("surfaces IncompatibleCharsetError via onError and never ACKs a corrupted body", async () => {
    let handlerRan = false;
    const errors: Error[] = [];

    const app = new Mllp().parser(parseHL7v2);
    app.on("*", (ctx) => {
      handlerRan = true;
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });

    server = serve(app, {
      onError: (error) => {
        errors.push(error);
      },
      port: 0,
    });
    await waitForReady(server.port);

    // PID-5 family name "José" with "é" as the single Latin-1 byte 0xE9 (invalid
    // UTF-8), and MSH-18 declaring 8859/1 — which we do not yet honour (see
    // https://github.com/rethinkhealth/glion/issues/662).
    const message = [
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1||||||8859/1",
      "PID|1||12345^^^MRN||José^John",
    ].join("\r");
    const latin1 = Uint8Array.from(message, (ch) => ch.codePointAt(0));

    const response = await sendBytes(server.port, latin1, 1000);

    // No silent corruption: the handler never sees a mangled body, no AA is
    // returned, and the decode failure surfaces through onError as an
    // IncompatibleCharsetError (the charset package's own error type).
    expect(handlerRan).toBe(false);
    expect(response).toBeUndefined();
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBeInstanceOf(IncompatibleCharsetError);
  });
});
