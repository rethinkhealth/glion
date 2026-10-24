import { serve } from "@glion/mllp/node";

import app from "./app.ts";
import { serverTls } from "./certificates.ts";

const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "2575", 10);

const server = serve(app, {
  hostname,
  onConnect: (connection) => {
    console.info(
      `Connection ${connection.id} from ${connection.remoteAddress} is open.`
    );
  },
  onDisconnect: (connection) => {
    console.info(`Connection ${connection.id} is closed.`);
  },
  onError: (error, connection) => {
    console.error(`Connection ${connection.id} failed.`, error);
  },
  port,
  tls: serverTls("certs"),
});

await server.listening;
console.info(`Listening for MLLP over TLS on ${hostname}:${server.port}.`);

// Stops accepting connections and ends each open one once its message is answered.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await server.close();
  });
}
