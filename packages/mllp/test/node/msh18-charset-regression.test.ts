// oxlint-disable promise/avoid-new
import net from "node:net";

import { parseHL7v2 } from "@glion/hl7v2";
import { CR, frame, FS } from "@glion/mllp-transport";

import { serve } from "../../src/node/serve.js";
import type { Server } from "../../src/node/serve.js";
import { Mllp } from "../../src/server/mllp.js";

/**
 * Regression for https://github.com/rethinkhealth/glion/issues/659.
 *
 * The server ignores the HL7v2 character set declared in MSH-18 and decodes
 * every inbound payload as UTF-8 with a NON-fatal `TextDecoder`
 * (`serve.ts` — `new TextDecoder()`, then `TEXT_DECODER.decode(payload)`).
 * A legacy single-byte feed (ISO 8859/1 / Windows-1252) is therefore silently
 * corrupted: a non-UTF-8 byte is replaced with U+FFFD and the mangled message
 * is parsed and routed with no error raised.
 *
 * This test PINS that buggy behavior. When MSH-18 handling lands (#659), the
 * assertions below must flip — the accented name should survive intact and the
 * `U+FFFD` substitution should disappear.
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

describe("MSH-18 character set is ignored — server silently corrupts a non-UTF-8 feed (regression for #659)", () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("replaces a Latin-1 byte with U+FFFD instead of honoring MSH-18", async () => {
    let decoded: string | undefined;

    const app = new Mllp().parser(parseHL7v2);
    app.on("*", (ctx) => {
      // ctx.req.raw is exactly the string serve.ts produced from
      // TEXT_DECODER.decode(payload) — the locus of the bug.
      decoded = ctx.req.raw;
      return {
        raw: `MSH|^~\\&|||||||ACK|ACK001|P|2.5.1\rMSA|AA|${ctx.controlId}`,
      };
    });

    server = serve(app, { port: 0 });
    await waitForReady(server.port);

    // A message whose PID-5 family name is "José" and that DECLARES 8859/1 in
    // MSH-18. The "é" is the single byte 0xE9 (Latin-1), not the two-byte UTF-8
    // sequence 0xC3 0xA9.
    const message = [
      "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1||||||8859/1",
      "PID|1||12345^^^MRN||José^John",
    ].join("\r");
    // Latin-1 encode: code points 0x00–0xFF map directly to one byte each, so
    // "é" (U+00E9) becomes 0xE9.
    const latin1 = Uint8Array.from(message, (ch) => ch.codePointAt(0));

    const response = await sendBytes(server.port, latin1);

    // The corruption is silent — the server still answers AA, never signalling
    // that it mangled the body.
    expect(response).toBeDefined();
    expect(response?.toString("utf8")).toContain("MSA|AA|MSG001");

    // The decoded body proves the data loss: the accented name is gone,
    // replaced by the Unicode replacement character.
    expect(decoded).toBeDefined();
    expect(decoded).not.toContain("José");
    expect(decoded).toContain("Jos�^John");
  });
});
