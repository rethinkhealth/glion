import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConnectionOptions, TlsOptions } from "node:tls";

/**
 * The server's TLS options: its certificate, and the authority every client
 * certificate must be issued by. A client without one is refused.
 */
export function serverTls(dir: string): TlsOptions {
  return {
    ca: readFileSync(join(dir, "ca.pem")),
    cert: readFileSync(join(dir, "server.pem")),
    key: readFileSync(join(dir, "server-key.pem")),
    requestCert: true,
  };
}

/**
 * The client's TLS options: its certificate, and the authority the server's
 * certificate must be issued by.
 */
export function clientTls(dir: string): ConnectionOptions {
  return {
    ca: readFileSync(join(dir, "ca.pem")),
    cert: readFileSync(join(dir, "client.pem")),
    key: readFileSync(join(dir, "client-key.pem")),
  };
}
