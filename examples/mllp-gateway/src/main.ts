import { connect } from "node:net";

import { gateway } from "./gateway.ts";

const KEEP_ALIVE_IDLE_MS = 30_000;

const receiver = {
  host: process.env.MLLP_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.MLLP_PORT ?? "2575", 10),
};
// Loopback by default: the gateway does not authenticate its callers.
const hostname = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);

const { close, server } = gateway({
  // Keep-alive ends a connection whose receiving system vanished while idle.
  dial: () =>
    connect(receiver).setNoDelay(true).setKeepAlive(true, KEEP_ALIVE_IDLE_MS),
});

server.listen(port, hostname, () => {
  console.info(
    `Forwarding POST http://${hostname}:${port}/messages to MLLP ${receiver.host}:${receiver.port}.`
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await close();
  });
}
