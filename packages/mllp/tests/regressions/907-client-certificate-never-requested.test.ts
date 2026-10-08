/**
 * Regression for https://github.com/rethinkhealth/glion/issues/907.
 *
 * Date: 2026-10-07
 * Symptom: a server configured with `tls.ca` to verify client certificates
 * accepted a remote system that presented no certificate at all.
 * Cause: Node's TLS server asks for a client certificate only when
 * `requestCert` is set, and `serve()` neither took nor passed it, so `ca` had
 * nothing to verify.
 * Resolution: `tls` takes `requestCert` and `rejectUnauthorized`, passed to
 * Node's TLS server as given.
 */

import { once } from "node:events";
import { connect } from "node:tls";

import { parseHL7v2 } from "@glion/hl7v2";
import { frame } from "@glion/mllp-codec";
import { encodeBytes } from "@glion/util-charset";
import { generate } from "selfsigned";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { serve } from "../../src/node/serve";
import type { Server } from "../../src/node/serve";
import { Mllp } from "../../src/server/mllp";

const SERVERNAME = "localhost";

const ADT_A01 =
  "MSH|^~\\&|SendApp|SendFac|RecvApp|RecvFac|20240101120000||ADT^A01^ADT_A01|MSG001|P|2.5.1";

const ACK =
  "MSH|^~\\&|RecvApp|RecvFac|SendApp|SendFac|20240101120000||ACK|ACK001|P|2.5.1\rMSA|AA|MSG001";

/** A CA, a server certificate for `localhost`, and a client certificate. */
async function issue() {
  const ca = await generate([{ name: "commonName", value: "glion test CA" }], {
    algorithm: "sha256",
    extensions: [
      { cA: true, critical: true, name: "basicConstraints" },
      { critical: true, keyCertSign: true, name: "keyUsage" },
    ],
  });
  const signedBy = { cert: ca.cert, key: ca.private };
  const [server, client] = await Promise.all([
    generate([{ name: "commonName", value: SERVERNAME }], {
      algorithm: "sha256",
      ca: signedBy,
      extensions: [
        { altNames: [{ type: 2, value: SERVERNAME }], name: "subjectAltName" },
        { name: "extKeyUsage", serverAuth: true },
      ],
    }),
    generate([{ name: "commonName", value: "glion" }], {
      algorithm: "sha256",
      ca: signedBy,
      extensions: [{ clientAuth: true, name: "extKeyUsage" }],
    }),
  ]);
  return { ca: ca.cert, client, server };
}

describe("serve() with tls.requestCert", () => {
  let pki: Awaited<ReturnType<typeof issue>>;
  let server: Server | undefined;

  beforeAll(async () => {
    pki = await issue();
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const listen = async () => {
    const app = new Mllp()
      .parser(parseHL7v2)
      .on("ADT^A01", () => ({ raw: ACK }));
    server = serve(app, {
      port: 0,
      tls: {
        ca: pki.ca,
        cert: pki.server.cert,
        key: pki.server.private,
        rejectUnauthorized: true,
        requestCert: true,
      },
    });
    await server.listening;
    return server.port;
  };

  it("refuses a remote system that presents no client certificate", async () => {
    const port = await listen();

    const remote = connect({ ca: pki.ca, port, servername: SERVERNAME });
    remote.on("data", () => {});
    remote.write(frame(encodeBytes(ADT_A01)));
    const [error] = await once(remote, "error");

    expect(error).toMatchObject({
      code: "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED",
    });
  });

  it("answers a remote system that presents a certificate the CA issued", async () => {
    const port = await listen();

    const remote = connect({
      ca: pki.ca,
      cert: pki.client.cert,
      key: pki.client.private,
      port,
      servername: SERVERNAME,
    });
    await once(remote, "secureConnect");
    remote.write(frame(encodeBytes(ADT_A01)));
    const [reply] = await once(remote, "data");
    remote.end();

    expect(reply).toEqual(Buffer.from(frame(encodeBytes(ACK))));
  });
});
