/**
 * Runtime-agnostic TCP adapter interface.
 *
 * Abstracts the TCP layer so the MLLP server works on
 * Node.js (net module) and Bun (Bun.listen) identically.
 * Adapters expose sockets as Web Streams for compatibility
 * with our existing MLLP streaming primitives.
 */

/**
 * TLS configuration options.
 */
export interface TlsOptions {
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

/**
 * Options for starting a TCP listener.
 */
export interface ListenOptions {
  port: number;
  hostname?: string;
  tls?: TlsOptions;
  backlog?: number;
  /**
   * Called for a server error that fires *after* the server is listening (a
   * startup/bind error rejects the `listening` promise instead). The adapter's
   * only error kind is server-scoped, so this is simply `onError`. Post-listen
   * server errors do not tear the server down — it keeps serving — so this is
   * purely an observability hook. The adapter must still register an error
   * listener regardless (an unhandled `'error'` event is process-fatal).
   */
  onError?: (error: Error) => void;
}

/**
 * Handle returned by listen(), used to manage server lifecycle.
 */
export interface TcpHandle {
  /** The port the server is listening on */
  readonly port: number;
  /** Resolves when the underlying TCP server has bound and started listening */
  readonly listening: Promise<void>;
  /** Gracefully close the server */
  close(): Promise<void>;
}

/**
 * Abstraction over a TCP socket exposing Web Streams.
 */
export interface AdapterSocket {
  readonly remoteAddress: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly secure: boolean;
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  /**
   * Tear down the connection. **MUST NOT throw** and **MUST be idempotent** —
   * the core calls it unguarded in a `finally` block, possibly on an
   * already-destroyed or half-open socket. Adapters own honouring this
   * contract.
   */
  close(): void;
}

/**
 * Handler invoked for each new TCP connection.
 */
export type ConnectionHandler = (socket: AdapterSocket) => void;

/**
 * TCP adapter interface for server-side listening.
 */
export interface TcpServerAdapter {
  listen(options: ListenOptions, handler: ConnectionHandler): TcpHandle;
}

/**
 * TCP adapter for server operations.
 */
export type TcpAdapter = TcpServerAdapter;
