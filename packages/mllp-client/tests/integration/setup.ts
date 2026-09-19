/**
 * Starts every remote in `remotes.ts`, once, in Node, and provides where they
 * are listening to each test project, whichever runtime runs it. Each remote
 * runs twice: over TCP, and over TLS with certificates a test CA issues here.
 *
 * Only the addresses and the certificates cross into the test process, so a
 * test that observes a remote's own side starts its own with `listen()`.
 *
 * @module
 */

import type { TlsOptions } from "node:tls";

import { generate } from "selfsigned";
import type { TestProject } from "vitest/node";

import { listen, released } from "./remote-tcp";
import type { Address, Remote } from "./remote-tcp";
import { REMOTES } from "./remotes";
import type { Remotes } from "./remotes";

/** The one name the TLS remotes' certificate lists. */
const SERVERNAME = "localhost";

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
  /** The TLS remotes' certificate. Lists {@link Pki.servername} only. */
  readonly serverCert: string;
  /** The private key for `serverCert`. */
  readonly serverKey: string;
  /** The one name `serverCert` lists. */
  readonly servername: string;
}

export interface Fixtures {
  /** Every remote in `remotes.ts`, over TCP. */
  readonly tcp: Remotes;
  /**
   * Every remote in `remotes.ts`, over TLS, plus one that answers `AA` only to
   * a client certificate {@link Fixtures.pki} issued.
   */
  readonly tls: Remotes & { readonly requiringClientCertificate: Address };
  readonly pki: Pki;
}

declare module "vitest" {
  export interface ProvidedContext {
    readonly fixtures: Fixtures;
  }
}

/** A CA, a server certificate for `localhost`, and a client certificate. */
async function issue(): Promise<Pki> {
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
  ]);
  return {
    ca: ca.cert,
    cert: client.cert,
    key: client.private,
    serverCert: server.cert,
    serverKey: server.private,
    servername: SERVERNAME,
  };
}

export default async function setup(project: TestProject) {
  const started: Remote[] = [];
  const pki = await issue();
  const serverTls: TlsOptions = { cert: pki.serverCert, key: pki.serverKey };

  const start = async (options: Parameters<typeof listen>[0]) => {
    const remote = await listen(options);
    started.push(remote);
    return { host: remote.host, port: remote.port };
  };

  /** The listening remotes of the catalogue, over `tls` when given. */
  const startListening = async (
    tls?: TlsOptions
  ): Promise<Record<string, Address>> => {
    const addresses: Record<string, Address> = {};
    for (const [name, spec] of Object.entries(REMOTES)) {
      if (spec) {
        addresses[name] = await start({ ...spec, tls });
      }
    }
    return addresses;
  };

  const tcp = await startListening();
  const tls = await startListening(serverTls);
  const requiringClientCertificate = await start({
    tls: {
      ...serverTls,
      ca: pki.ca,
      rejectUnauthorized: true,
      requestCert: true,
    },
  });

  // Last, so nothing binds a released port afterwards. One address serves both
  // transports: nothing listens on it either way.
  for (const [name, spec] of Object.entries(REMOTES)) {
    if (spec === null) {
      const address = await released();
      tcp[name] = address;
      tls[name] = address;
    }
  }

  project.provide("fixtures", {
    pki,
    tcp: tcp as Remotes,
    tls: { ...(tls as Remotes), requiringClientCertificate },
  });

  return async () => {
    await Promise.all(started.map((remote) => remote.close()));
  };
}
