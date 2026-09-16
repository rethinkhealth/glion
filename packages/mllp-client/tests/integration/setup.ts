/**
 * Starts the remote systems the integration suites dial, once, in Node, and
 * provides their addresses to every test project, whichever runtime runs it.
 * Every remote runs twice: over TCP, and over TLS with certificates a test CA
 * issues at startup.
 *
 * @module
 */

import type { TlsOptions } from "node:tls";

import { generate } from "selfsigned";
import type { TestProject } from "vitest/node";

import { acknowledging, silence } from "../remote";
import { acknowledgment, listen, rejectingFirst, released } from "./remote-tcp";
import type { Address, Answer, Remote } from "./remote-tcp";

const SPLIT_DELAY_MS = 40;

export interface Remotes {
  /** Answers every message with `AA`. */
  readonly acknowledging: Address;
  /** Answers `AA` and sends FIN in the same write. */
  readonly acknowledgingThenEnding: Address;
  /** Reads one message, then resets the connection. */
  readonly dropping: Address;
  /** Answers every message with the message itself. */
  readonly echoing: Address;
  /** Reads one message, then sends FIN without answering. */
  readonly ending: Address;
  /** Accepts, never writes, and never answers a FIN. */
  readonly holdingOpen: Address;
  /** Nothing listens here. */
  readonly refused: Address;
  /** Answers the first message on a connection with `AE`, the rest with `AA`. */
  readonly rejectingFirst: Address;
  /** Accepts and never writes. */
  readonly silent: Address;
  /** Answers `AA` in two writes 40 ms apart. */
  readonly splitting: Address;
}

/** The test CA, and what it issued. */
export interface TestPki {
  /** The CA certificate, PEM. Trusts every certificate below. */
  readonly ca: string;
  /** A client certificate, PEM. */
  readonly cert: string;
  /** The client certificate's private key, PEM. */
  readonly key: string;
  /** The TLS remotes' certificate, PEM. Lists `localhost` only. */
  readonly serverCert: string;
  /** The TLS remotes' private key, PEM. */
  readonly serverKey: string;
  /** The one name `serverCert` lists. */
  readonly servername: string;
  /** Answers `AA` over TLS, and only to a client certificate the CA issued. */
  readonly requiringClientCertificate: Address;
}

declare module "vitest" {
  export interface ProvidedContext {
    readonly remotes: Remotes;
    readonly remotesOverTls: Remotes;
    readonly pki: TestPki;
  }
}

const SERVERNAME = "localhost";

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
  const server = await generate([{ name: "commonName", value: SERVERNAME }], {
    algorithm: "sha256",
    ca: signedBy,
    extensions: [
      { altNames: [{ type: 2, value: SERVERNAME }], name: "subjectAltName" },
      { name: "extKeyUsage", serverAuth: true },
    ],
  });
  const client = await generate([{ name: "commonName", value: "glion" }], {
    algorithm: "sha256",
    ca: signedBy,
    extensions: [{ clientAuth: true, name: "extKeyUsage" }],
  });
  return { ca: ca.cert, client, server };
}

export default async function setup(project: TestProject) {
  const started: Remote[] = [];
  const { ca, client, server } = await issue();
  const serverTls: TlsOptions = { cert: server.cert, key: server.private };

  const remotes = async (tls?: TlsOptions): Promise<Remotes> => {
    const start = async (
      answer: Answer,
      allowHalfOpen = false
    ): Promise<Address> => {
      const remote = await listen({ allowHalfOpen, answer, tls });
      started.push(remote);
      return { host: remote.host, port: remote.port };
    };

    return {
      acknowledging: await start(acknowledging("AA")),
      acknowledgingThenEnding: await start((message, socket) => {
        socket.end(acknowledgment(message));
      }),
      dropping: await start((_message, socket) => {
        socket.destroy();
      }),
      echoing: await start((message) => message),
      ending: await start((_message, socket) => {
        socket.end();
      }),
      holdingOpen: await start(silence, true),
      refused: await released(),
      rejectingFirst: await start(rejectingFirst()),
      silent: await start(silence),
      splitting: await start((message, socket) => {
        const bytes = acknowledgment(message);
        const mid = Math.floor(bytes.length / 2);
        socket.write(bytes.subarray(0, mid));
        setTimeout(() => socket.write(bytes.subarray(mid)), SPLIT_DELAY_MS);
      }),
    };
  };

  const mutual = await listen({
    tls: { ...serverTls, ca, rejectUnauthorized: true, requestCert: true },
  });
  started.push(mutual);

  project.provide("remotes", await remotes());
  project.provide("remotesOverTls", await remotes(serverTls));
  project.provide("pki", {
    ca,
    cert: client.cert,
    key: client.private,
    requiringClientCertificate: { host: mutual.host, port: mutual.port },
    serverCert: server.cert,
    serverKey: server.private,
    servername: SERVERNAME,
  });

  return async () => {
    await Promise.all(started.map((remote) => remote.close()));
  };
}
