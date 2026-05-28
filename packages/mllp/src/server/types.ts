import type { Root } from "@glion/ast";
import type { Processor } from "unified";
import type { VFile } from "vfile";

/**
 * Connection metadata for an MLLP socket.
 */
export interface ConnectionInfo {
  readonly id: number;
  readonly remoteAddress: string;
  readonly remotePort: number;
  readonly localPort: number;
  readonly secure: boolean;
  readonly state: Map<string, unknown>;
}

/**
 * MLLP response — a raw HL7v2 string that the server encodes
 * with MLLP framing before sending back over TCP.
 *
 * Acknowledgment helpers (ack/nak) are not built in — register
 * an acknowledgment middleware via `.use()` to generate ACK/NAK responses.
 */
export interface Response {
  readonly raw: string;
}

/**
 * The MLLP context object.
 *
 * Routing fields (messageType, triggerEvent, etc.) are extracted from
 * the **pre-transform** parsed tree and are always available synchronously.
 *
 * The transformed tree, VFile, and compiled result are lazy — they
 * trigger pipeline stages on first access. See ADR-0013.
 */
export interface Context {
  /** Incoming message data */
  readonly req: {
    /** Original HL7 message string (without MLLP framing) */
    readonly raw: string;
    /** Raw bytes from MLLP frame payload */
    readonly bytes: Uint8Array;
  };

  /** TCP connection metadata */
  readonly connection: ConnectionInfo;

  /**
   * Parsed AST — always available synchronously. Use this for reading
   * MSH fields, building ACKs, routing, or any operation that doesn't
   * need to wait for transforms to complete.
   *
   * Note: this is the same object reference as the tree returned by
   * `tree()`. After `tree()` resolves, transformers may have enriched
   * it in-place (e.g., decoded escapes, resolved message structure).
   * The routing fields (messageType, triggerEvent, etc.) are cached
   * as separate string properties and always reflect the original
   * wire values regardless of transforms.
   */
  readonly ast: Root;

  /**
   * Transformed AST. Triggers `run()` (transformers) on first call.
   * Cached after first access — subsequent calls return the same tree.
   */
  tree(): Promise<Root>;

  /**
   * VFile with diagnostics and lint messages. Created during context
   * creation. Diagnostics accumulate after `tree()` triggers transformers.
   */
  file: VFile;

  /**
   * Compiled result from the processor's compiler (e.g., JSON from
   * hl7v2Jsonify). Triggers both `run()` and `stringify()` on first call.
   * Undefined when the processor has no compiler.
   * Cached after first access.
   */
  result(): Promise<unknown | undefined>;

  /** Response to send back. Set by middleware or handler. */
  res: Response | undefined;

  /** MSH-9.1 message type (e.g., "ADT") — from pre-transform parse */
  messageType: string;
  /** MSH-9.2 trigger event (e.g., "A01") — from pre-transform parse */
  triggerEvent: string;
  /** MSH-9.3 message structure (e.g., "ADT_A01") — from pre-transform parse */
  messageStructure: string;
  /** MSH-12 version (e.g., "2.5.1") — from pre-transform parse */
  version: string;
  /** MSH-10 message control ID — from pre-transform parse */
  controlId: string;

  /** Store a variable */
  set<K extends string>(key: K, value: unknown): void;
  /** Retrieve a variable */
  get<K extends string>(key: K): unknown;
  /** Read-only snapshot of all variables */
  readonly var: Readonly<Record<string, unknown>>;
}

/**
 * A unified `Processor` that parses HL7v2 messages into `Root` trees.
 *
 * Only `ParseTree` is constrained — the remaining type params are left
 * loose so that any processor built with `unified().use(hl7v2Parser)`
 * is assignable regardless of which transformer/compiler plugins are added.
 */
export type Hl7v2Processor = Processor<Root, Root, Root>;

/**
 * Middleware function signature (Hono/Koa onion model).
 */
export type MiddlewareReturn =
  // oxlint-disable-next-line typescript/no-invalid-void-type
  | Promise<Response | undefined | void>
  | Promise<void>
  | Response
  | undefined
  // oxlint-disable-next-line typescript/no-invalid-void-type
  | void;

export type Middleware = (
  ctx: Context,
  next: () => Promise<void>
) => MiddlewareReturn;

/**
 * Terminal route handler — may return a response or void (no response).
 */
export type Handler = (
  ctx: Context
  // oxlint-disable-next-line typescript/no-invalid-void-type
) => Promise<Response | undefined | void> | Response | undefined | void;

/**
 * Error handler — receives the error and context, returns a response.
 */
export type ErrorHandler = (
  err: Error,
  ctx: Context
  // oxlint-disable-next-line typescript/no-invalid-void-type
) => Promise<Response | undefined | void> | Response | undefined | void;

/**
 * A filter function for route or middleware matching.
 * Receives the full context and returns true if the route/middleware applies.
 */
export type RouteFilter = (ctx: Context) => boolean;

/**
 * Parsed route pattern for matching against incoming messages.
 */
export interface RoutePattern {
  /** Original pattern string (e.g., "ADT^A01") */
  readonly source: string;
  /** Message type to match, or "*" for wildcard */
  readonly messageType: string;
  /** Trigger event to match, or "*" for wildcard */
  readonly triggerEvent: string;
}

/**
 * Parse a pattern string like "ADT^A01", "ADT^*", "*^A01", or "*"
 * into a structured RoutePattern.
 */
export function parsePattern(pattern: string): RoutePattern {
  if (pattern === "*") {
    return { messageType: "*", source: pattern, triggerEvent: "*" };
  }

  const caretIndex = pattern.indexOf("^");
  if (caretIndex === -1) {
    return { messageType: pattern, source: pattern, triggerEvent: "*" };
  }

  return {
    messageType: pattern.slice(0, caretIndex) || "*",
    source: pattern,
    triggerEvent: pattern.slice(caretIndex + 1) || "*",
  };
}

/**
 * Test whether a route pattern matches a given message type and trigger event.
 */
export function matchPattern(
  pattern: RoutePattern,
  messageType: string,
  triggerEvent: string
): boolean {
  const typeMatch =
    pattern.messageType === "*" || pattern.messageType === messageType;
  const eventMatch =
    pattern.triggerEvent === "*" || pattern.triggerEvent === triggerEvent;
  return typeMatch && eventMatch;
}
