import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { connect } from "node:tls";
import type { ConnectionOptions } from "node:tls";

import { MllpClient, MllpClientError } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";
import { serve } from "@glion/mllp/node";
import { parseHL7v2 } from "@glion/parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import app from "../src/app.ts";
import { clientTls, serverTls } from "../src/certificates.ts";

const certs = mkdtempSync(join(tmpdir(), "glion-mllp-tls-"));
execFileSync("sh", ["scripts/certs.sh", certs]);
const otherCerts = mkdtempSync(join(tmpdir(), "glion-mllp-tls-other-"));
execFileSync("sh", ["scripts/certs.sh", otherCerts]);

const message = parseHL7v2(
  readFileSync(new URL("../samples/adt-a01.hl7", import.meta.url), "utf8")
);

let connections = 0;
const server = serve(app, {
  hostname: "127.0.0.1",
  onConnect: () => {
    connections += 1;
  },
  port: 0,
  tls: serverTls(certs),
});

const client = (options: ConnectionOptions) =>
  new MllpClient({
    reconnect: false,
    socket: nodeSocket(() =>
      connect({
        ...options,
        host: "127.0.0.1",
        port: server.port,
        servername: "localhost",
      })
    ),
  });

beforeAll(async () => {
  await server.listening;
});

afterAll(async () => {
  await server.close();
  rmSync(certs, { force: true, recursive: true });
  rmSync(otherCerts, { force: true, recursive: true });
});

describe("mllp-tls", () => {
  it("accepts a message from a client whose certificate the authority issued", async () => {
    const sender = client(clientTls(certs));

    const ack = await sender.send(message);
    await sender.close();

    expect(ack.code).toBe("AA");
  });

  it("refuses a client that presents no certificate before any message is read", async () => {
    const { ca } = clientTls(certs);
    const sender = client({ ca });
    const before = connections;

    const rejection = await sender
      .send(message)
      .catch((error: unknown) => error);
    await sender.close();

    expect(rejection).toBeInstanceOf(MllpClientError);
    expect(connections).toBe(before);
  });

  it("disconnects a client whose certificate another authority issued before any message is read", async () => {
    const { ca } = clientTls(certs);
    const { cert, key } = clientTls(otherCerts);
    const sender = client({ ca, cert, key });
    const before = connections;

    const rejection = await sender
      .send(message)
      .catch((error: unknown) => error);
    await sender.close();

    expect(rejection).toBeInstanceOf(MllpClientError);
    expect(connections).toBe(before);
  });

  it("does not connect to a server whose certificate it cannot verify", async () => {
    const { cert, key } = clientTls(certs);
    const sender = client({ cert, key });

    const rejection = await sender
      .send(message)
      .catch((error: unknown) => error);
    await sender.close();

    expect(rejection).toMatchObject({
      code: "CONNECTION_FAILED",
      delivery: "not-sent",
    });
  });
});
