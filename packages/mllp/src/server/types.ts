import type { AckSuccessCode } from "@glion/ack";
import type { Root } from "@glion/ast";
import type { VFile } from "vfile";

import type { AcknowledgeOptions } from "./acknowledge";

/**
 * The `env` argument of `handle()`: optional when `E` admits `undefined`,
 * required otherwise.
 */
export type EnvArgs<E> = undefined extends E ? [env?: E] : [env: E];

/**
 * The reply to a message: a raw HL7v2 string. A connection writes it back
 * with MLLP framing.
 */
export interface Response {
  readonly raw: string;
}

/**
 * The MLLP context object.
 *
 * The routing fields are read from the MSH of the tree the processor
 * produced, once, before routing. The compiled result is lazy: `result()`
 * runs the compiler on first call.
 */
export interface Context<E = unknown> {
  /** Incoming message data */
  readonly req: {
    /** The payload decoded as UTF-8, without MLLP framing. */
    readonly raw: string;
  };
  /**
   * The error this message raised: a route filter, middleware or handler
   * throw, a `next()` called twice
   * (`NEXT_CALLED_TWICE`), or the `AckApplicationReject` of a message no
   * route matches. A later error replaces it; a middleware that throws one
   * passes this as its `cause` to keep it. `undefined` while none has.
   */
  readonly error: Error | undefined;

  /**
   * What the runtime passed to `handle()` with this message, such as a
   * Workers environment or the connection `serve()` accepted it on.
   * `undefined` when it passed none.
   */
  readonly env: E;

  /**
   * The tree the processor parsed and ran its transformers on. The routing
   * fields keep the values they had before routing, whatever a handler
   * changes in it.
   */
  readonly ast: Root;

  /** Resolves to `ast`. */
  tree(): Promise<Root>;

  /** The file the processor read, with its messages; none is fatal. */
  file: VFile;

  /**
   * The processor's compiled result (e.g., JSON from hl7v2Jsonify), or
   * `undefined` when the processor has no compiler. Runs `stringify()` on
   * first call, and is cached.
   */
  result(): Promise<unknown | undefined>;

  /**
   * The acknowledgment of this message as a reply: `acknowledge()` of its
   * MSH as the processor parsed it, serialized. Changes the transforms or a
   * handler make to the tree do not change it. MSA-1 defaults to `AA`.
   */
  ack(options?: AckOptions): Response;
  /**
   * Response to send back. A later reply replaces it, and an error replaces
   * it with the error's NAK.
   */
  res: Response | undefined;

  /** MSH-9.1 message type (e.g., "ADT") */
  readonly messageType: string;
  /** MSH-9.2 trigger event (e.g., "A01") */
  readonly triggerEvent: string;
  /** MSH-9.3 message structure (e.g., "ADT_A01") */
  readonly messageStructure: string;
  /** MSH-12 version (e.g., "2.5.1") */
  readonly version: string;
  /** MSH-10 message control ID */
  readonly controlId: string;

  /** Store a variable */
  set<K extends string>(key: K, value: unknown): void;
  /** Retrieve a variable */
  get<K extends string>(key: K): unknown;
  /** Read-only snapshot of all variables */
  readonly var: Readonly<Record<string, unknown>>;
}

/**
 * Observes an error raised by a payload no middleware runs on. `env` is what
 * the runtime passed to `handle()`. MUST NOT throw.
 */
export type ErrorHandler<E = unknown> = (
  error: Error,
  env: E
) => Promise<void> | undefined;

/**
 * Options for `new Mllp()`: the delimiters and the time zone of every
 * acknowledgment the app writes, as `acknowledge()` takes them, and the
 * serializer of every response.
 */
export interface MllpOptions extends Pick<
  AcknowledgeOptions,
  "delimiters" | "timeZone"
> {
  /**
   * Writes a response's tree as HL7v2 text. Defaults to `toHl7v2` from
   * `@glion/to-hl7v2`, which encodes each value's escape sequences.
   */
  serializer?: (tree: Root) => string;
}

/**
 * The options of `ctx.ack()`: those of `acknowledge()`, without the ones the
 * app is given.
 */
export type AckOptions = Omit<
  AcknowledgeOptions,
  "code" | keyof MllpOptions
> & {
  /** MSA-1: `AA` or `CA`. Defaults to `AA`. A NAK is the reply to a throw. */
  code?: AckSuccessCode;
};

// Re-exported from @glion/parser — the ecosystem home of "a unified
// processor over HL7v2 trees"; the client's `parser` option shares it.
export type { Hl7v2Processor } from "@glion/parser";

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

export type Middleware<E = unknown> = (
  ctx: Context<E>,
  next: () => Promise<void>
) => MiddlewareReturn;

/**
 * Terminal route handler. A returned response is the reply; returning
 * nothing replies `AA`.
 */
export type Handler<E = unknown> = (
  ctx: Context<E>
  // oxlint-disable-next-line typescript/no-invalid-void-type
) => Promise<Response | undefined | void> | Response | undefined | void;

/**
 * A filter function for route or middleware matching.
 * Receives the full context and returns true if the route/middleware applies.
 */
export type RouteFilter<E = unknown> = (ctx: Context<E>) => boolean;

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
