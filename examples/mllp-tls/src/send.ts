import { readFileSync } from "node:fs";
import { connect } from "node:tls";

import { AckException } from "@glion/ack";
import { MllpClient, MllpClientError } from "@glion/mllp-client";
import { nodeSocket } from "@glion/mllp-client/node";
import { parseHL7v2 } from "@glion/parser";

import { clientTls } from "./certificates.ts";

const [path] = process.argv.slice(2);
if (!path) {
  console.error(
    "The command names no message file; name one, as in `node src/send.ts samples/adt-a01.hl7`."
  );
  process.exit(2);
}

// The server's certificate is checked against this name, so it is a host name
// the certificate lists, not an address.
const host = process.env.HOST ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "2575", 10);

const client = new MllpClient({
  reconnect: false,
  socket: nodeSocket(() =>
    connect({ ...clientTls("certs"), host, port, servername: host }).setNoDelay(
      true
    )
  ),
});

try {
  const ack = await client.send(parseHL7v2(readFileSync(path, "utf8")));
  console.info(`${ack.code}: message ${ack.controlId} was accepted.`);
} catch (error) {
  if (error instanceof AckException) {
    console.error(error.message);
    process.exitCode = 1;
  } else if (error instanceof MllpClientError) {
    console.error(error.message, error.cause ?? "");
    process.exitCode = 2;
  } else {
    throw error;
  }
} finally {
  await client.close();
}
