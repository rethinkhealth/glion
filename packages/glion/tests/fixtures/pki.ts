/**
 * A test CA, the server certificate it issued for `localhost`, and a client
 * certificate. Issued fresh per call; nothing is checked in.
 *
 * @module
 */

import { generate } from "selfsigned";

/** The one name the server certificate lists. */
export const SERVERNAME = "localhost";

/** X.509 GeneralName tag for a DNS name (RFC 5280 §4.2.1.6). */
const DNS_NAME = 2;

/** A test CA, and the certificates it issued. PEM throughout. */
export interface Pki {
  /** Trusts every certificate below. */
  readonly ca: string;
  /** A client certificate, for mutual TLS. */
  readonly cert: string;
  /** The private key for `cert`. */
  readonly key: string;
  /** The server certificate. Lists {@link SERVERNAME} only. */
  readonly serverCert: string;
  /** The private key for `serverCert`. */
  readonly serverKey: string;
  /**
   * A server certificate that is its own issuer, as a development server's
   * is. Lists {@link SERVERNAME} only, and {@link ca} does not trust it.
   */
  readonly selfSignedCert: string;
  /** The private key for `selfSignedCert`. */
  readonly selfSignedKey: string;
}

/**
 * Issues a CA, the server and client certificates it signed, and a
 * self-signed server certificate. All server certificates are for
 * `localhost`.
 */
export async function issue(): Promise<Pki> {
  const ca = await generate([{ name: "commonName", value: "glion test CA" }], {
    algorithm: "sha256",
    extensions: [
      { cA: true, critical: true, name: "basicConstraints" },
      { critical: true, keyCertSign: true, name: "keyUsage" },
    ],
  });
  const signedBy = { cert: ca.cert, key: ca.private };
  const [server, client, selfSigned] = await Promise.all([
    generate([{ name: "commonName", value: SERVERNAME }], {
      algorithm: "sha256",
      ca: signedBy,
      extensions: [
        {
          altNames: [{ type: DNS_NAME, value: SERVERNAME }],
          name: "subjectAltName",
        },
        { name: "extKeyUsage", serverAuth: true },
      ],
    }),
    generate([{ name: "commonName", value: "glion" }], {
      algorithm: "sha256",
      ca: signedBy,
      extensions: [{ clientAuth: true, name: "extKeyUsage" }],
    }),
    generate([{ name: "commonName", value: SERVERNAME }], {
      algorithm: "sha256",
      extensions: [
        {
          altNames: [{ type: DNS_NAME, value: SERVERNAME }],
          name: "subjectAltName",
        },
        { name: "extKeyUsage", serverAuth: true },
      ],
    }),
  ]);
  return {
    ca: ca.cert,
    cert: client.cert,
    key: client.private,
    selfSignedCert: selfSigned.cert,
    selfSignedKey: selfSigned.private,
    serverCert: server.cert,
    serverKey: server.private,
  };
}
