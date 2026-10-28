// oxlint-disable promise/avoid-new
import net from "node:net";

import { CR, frame, FS } from "@glion/mllp-codec";
import { CharsetError } from "@glion/util-charset";

import { serve } from "../../src/node/serve";
import type { Server } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

/**
 * Regression for https://github.com/rethinkhealth/glion/issues/659.
 *
 * The server decodes each inbound payload as UTF-8 via `decodeBytes(payload)`
 * (from `@glion/util-charset`), fatally. A non-UTF-8 feed (e.g. ISO 8859/1)
 * therefore fails LOUDLY — no middleware or handler runs, `app.onError()`
 * observes the `CharsetError` it throws, and the sender is answered `AE` —
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

  it("gives onError() the CharsetError and answers AE, never AA", async () => {
    let handlerRan = false;
    const errors: Error[] = [];

    const app = new Mllp().onError((raised) => {
      errors.push(raised);
    });
    app.on("*", (ctx) => {
      handlerRan = true;
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    // PID-5 family name "Müller" with "ü" as the single Latin-1 byte 0xFC (invalid
    // UTF-8), and MSH-18 declaring 8859/1 — which we do not yet honour (see
    // https://github.com/rethinkhealth/glion/issues/662).
    const message = [
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1||||||8859/1",
      "PID|1||12345^^^MRN||Müller^Anna",
    ].join("\r");
    // String iteration never yields an empty string, so codePointAt(0) is
    // always defined — and every character here is Latin-1, so the code
    // point IS the wire byte.
    const latin1 = Uint8Array.from(
      message,
      (ch) => ch.codePointAt(0) as number
    );

    const response = await sendBytes(server.port, latin1, 1000);

    // No silent corruption: the handler never sees a mangled body, the reply
    // is AE echoing MSH-10 in MSA-2, and onError() observes the CharsetError.
    expect(handlerRan).toBe(false);
    expect(response?.toString("utf8")).toContain("\rMSA|AE|MSG001");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(CharsetError);
  });
});
