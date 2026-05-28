/**
 * JSON manifest the parent writes to `.glion/manifest.json` before
 * spawning the child. Contains everything the child needs — the child
 * never re-discovers or re-compiles anything.
 */
export interface ChildManifest {
  /** Absolute path to the compiled entry file (.glion/*.js). */
  compiledEntry: string;
  port: number;
  hostname: string;
  tls?: {
    cert: string;
    key: string;
    ca?: string;
    passphrase?: string;
  };
  keepAlive?: boolean;
  keepAliveInitialDelay?: number;
  socketTimeout?: number;
}
