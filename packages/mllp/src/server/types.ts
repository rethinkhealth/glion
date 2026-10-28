import type { Root } from "@glion/ast";

import type { AcknowledgeOptions } from "./acknowledge";
import type { MllpRequest } from "./request";

/**
 * The `env` argument of `handle()`: optional when `E` admits `undefined`,
 * required otherwise.
 */
export type EnvArgs<E> = undefined extends E ? [env?: E] : [env: E];

/**
 * MLLP response — a raw HL7v2 string. A connection writes it back as UTF-8
 * with MLLP framing.
 */
export interface Response {
  readonly raw: string;
}

/**
 * The MLLP context of one message: the request that arrived, the response
 * going back, and what the app adds.
 */
export interface Context<E = unknown> {
  /** The message that arrived, as the app's processor read it. */
  readonly req: MllpRequest;
  /**
   * The error this message raised: a route filter, middleware or handler
   * throw, a `next()` called twice (`NEXT_CALLED_TWICE`), or the
   * `AckApplicationReject` of a message no route matches. A later error
   * replaces it; a middleware that throws one passes this as its `cause` to
   * keep it. `undefined` while none has.
   */
  readonly error: Error | undefined;

  /**
   * What the runtime passed to `handle()` with this message, such as a
   * Workers environment, or under `serve()` a `NodeEnv`, which holds the
   * connection as `connection`. `undefined` when it passed none.
   */
  readonly env: E;

  /**
   * Response to send back. A later response replaces it, and an error
   * replaces it with the error's NAK.
   */
  res: Response | undefined;

  /** Store a variable */
  set<K extends string>(key: K, value: unknown): void;
  /** Retrieve a variable */
  get<K extends string>(key: K): unknown;
  /** Read-only snapshot of all variables */
  readonly var: Readonly<Record<string, unknown>>;
}

/**
 * Observes an error a message raised: a payload that is not UTF-8, a
 * processor throw, the processor's first fatal message, or the error of a
 * route filter, middleware or handler. Runs when the error is raised. `env`
 * is what the runtime passed to `handle()`. MUST NOT throw.
 */
export type ErrorHandler<E = unknown> = (
  error: Error,
  env: E
) => Promise<void> | undefined;

/**
 * Options for `new Mllp()`: the delimiters and the time zone of every
 * acknowledgment the app writes, as `acknowledge()` takes them, and the
 * serializer that writes it.
 */
export interface MllpOptions extends Pick<
  AcknowledgeOptions,
  "delimiters" | "timeZone"
> {
  /**
   * Writes an acknowledgment's tree as HL7v2 text. Defaults to `toHl7v2` from
   * `@glion/to-hl7v2`, which encodes each value's escape sequences.
   */
  serializer?: (tree: Root) => string;
}

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
 * Terminal route handler — may return a response or void (no response).
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
  /** MSH-9.1 message code to match, or "*" for wildcard */
  readonly messageCode: string;
  /** Trigger event to match, or "*" for wildcard */
  readonly triggerEvent: string;
}

/**
 * Parse a pattern string like "ADT^A01", "ADT^*", "*^A01", or "*"
 * into a structured RoutePattern.
 */
export function parsePattern(pattern: string): RoutePattern {
  if (pattern === "*") {
    return { messageCode: "*", source: pattern, triggerEvent: "*" };
  }

  const caretIndex = pattern.indexOf("^");
  if (caretIndex === -1) {
    return { messageCode: pattern, source: pattern, triggerEvent: "*" };
  }

  return {
    messageCode: pattern.slice(0, caretIndex) || "*",
    source: pattern,
    triggerEvent: pattern.slice(caretIndex + 1) || "*",
  };
}

/**
 * Test whether a route pattern matches a given message code (MSH-9.1) and
 * trigger event (MSH-9.2).
 */
export function matchPattern(
  pattern: RoutePattern,
  messageCode: string,
  triggerEvent: string
): boolean {
  const typeMatch =
    pattern.messageCode === "*" || pattern.messageCode === messageCode;
  const eventMatch =
    pattern.triggerEvent === "*" || pattern.triggerEvent === triggerEvent;
  return typeMatch && eventMatch;
}
