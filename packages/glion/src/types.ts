/**
 * JSON manifest the parent writes to `.glion/manifest.json` before
 * spawning the child. Contains everything the child needs — the child
 * never re-discovers or re-compiles anything.
 */
export interface ChildManifest {
  /** Absolute path to the compiled entry file (.glion/*.js). */
  compiledEntry: string;
  /**
   * Absolute path to the app file the user wrote. The child reports failures
   * against this one: the compiled copy is glion's own artifact, not
   * something the user can act on.
   */
  entry: string;
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
