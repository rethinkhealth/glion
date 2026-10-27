import {
  AckApplicationReject,
  AckCode,
  Hl7ErrorCode,
  isAckException,
  Severity,
} from "@glion/ack";
import type { AckNakCode } from "@glion/ack";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value as queryValue } from "@glion/util-query";
import { nowDTM } from "@glion/util-timestamp";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import { compose, isResponse } from "./compose";
import { createContext } from "./context";
import type { MessageContext } from "./context";
import { messageHeader, readHeader, readRequest } from "./request";
import type { MllpRequest } from "./request";
import { Router } from "./router";
import type {
  ConnectionInfo,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  MllpOptions,
  Response,
  RouteFilter,
} from "./types";

/**
 * MLLP application for HL7v2 messaging.
 *
 * A pure routing and middleware engine with no TCP/server concerns.
 * Use `serve()` to bind this to a TCP server.
 *
 * @example
 *   ```typescript
 *   import { AckCode } from "@glion/ack";
 *   import { Mllp } from "@glion/mllp";
 *   import { parseHL7v2 } from "@glion/hl7v2";
 *
 *   const app = new Mllp()
 *     .parser(parseHL7v2)
 *     .on("ADT^A01", async (ctx) => {
 *       await save(await ctx.result()); // replies AA
 *     })
 *     .on("ORM^O01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));
 *   ```;
 */
export class Mllp {
  readonly #router = new Router();
  readonly #errorHandlers: ErrorHandler[] = [];
  readonly #options: MllpOptions & Required<Pick<MllpOptions, "serializer">>;
  #processor: Hl7v2Processor | undefined;

  /**
   * @throws {RangeError} When `options.timeZone` is not an IANA time zone
   * name.
   */
  constructor(options: MllpOptions = {}) {
    // Reads the clock in the zone once, so an unknown zone throws here rather
    // than on every message.
    nowDTM({ timeZone: options.timeZone });
    this.#options = {
      delimiters: options.delimiters,
      serializer: options.serializer ?? toHl7v2,
      timeZone: options.timeZone,
    };
  }

  /**
   * Register an HL7v2 processor for incoming messages.
   *
   * Accepts a unified `Processor` — either a pre-built one like
   * `parseHL7v2` from `@glion/hl7v2`, or a custom composition
   * via `unified().use(hl7v2Parser).use(...)`.
   *
   * Must be called before `handle()`. Calling multiple times replaces
   * the previous processor (last-write-wins).
   */
  parser(processor: Hl7v2Processor): this {
    this.#processor = processor;
    return this;
  }

  /**
   * Register middleware.
   *
   * Accepts:
   *
   * - A middleware function: `(ctx, next) => { ... }`
   * - A scoped middleware: `app.use('ADT^*', middleware)` or `app.use(filter,
   *   middleware)`
   */
  use(middleware: Middleware, options?: { prepend?: boolean }): this;
  use(patternOrFilter: string | RouteFilter, middleware: Middleware): this;
  use(
    first: string | RouteFilter | Middleware,
    second?: Middleware | { prepend?: boolean }
  ): this {
    // Scoped middleware: use('ADT^*', middleware) or use(filter, middleware)
    if (
      (typeof first === "string" || typeof first === "function") &&
      typeof second === "function"
    ) {
      this.#router.addMiddleware(first as string | RouteFilter, second);
      return this;
    }

    // Standard middleware: use((ctx, next) => { ... })
    if (typeof first === "function") {
      const prepend =
        second && typeof second === "object" ? second.prepend : false;
      this.#router.addMiddleware(first as Middleware, prepend);
      return this;
    }

    return this;
  }

  /**
   * Register a route handler for a message type pattern or filter function.
   *
   * String patterns:
   *
   * - `"ADT^A01"` — exact match
   * - `"ADT^*"` — any ADT message
   * - `"*^A01"` — any type with A01 trigger
   * - `"*"` — catch-all
   *
   * Filter functions:
   *
   * - `(ctx) => ctx.messageType === "ADT" && ctx.version === "2.5.1"`
   */
  on(patternOrFilter: string | RouteFilter, handler: Handler): this {
    this.#router.add(patternOrFilter, handler);
    return this;
  }

  /**
   * Register a handler for an error raised by a payload no middleware runs
   * on: one that is not UTF-8 (`MllpServerError` `INCOMPATIBLE_CHARSET`), or
   * that the parser throws on. The handler observes the error; it does not
   * change the response. Each handler registered runs, in the order
   * registered, before `handle()` resolves.
   */
  onError(handler: ErrorHandler): this {
    this.#errorHandlers.push(handler);
    return this;
  }

  /**
   * Process one MLLP frame payload through the middleware chain and router,
   * and return the reply, or `undefined` for none. This is the integration
   * point — analogous to Hono's `fetch()`.
   *
   * The pipeline is lazy (see ADR-0013):
   *
   * 1. Decode and parse (sync, fast) — always runs, extracts routing fields
   * 2. Route match — uses pre-transform routing fields
   * 3. Middleware, then the route handler
   * 4. Transform/compile — only when handlers access ctx.tree()/ctx.result()
   *
   * The reply is the acknowledgment the route handler's outcome describes:
   *
   * - It returns a response, or sets `ctx.res`: that response.
   * - It returns nothing, or a value that is not a response: `AA`.
   * - It throws an `AckException`: its `code` in MSA-1.
   * - It throws anything else: `AE`.
   * - No route matches: `AR`.
   *
   * No reply carries MSA-3: an error's `message` and an `AckException`'s
   * `text` are never sent.
   *
   * A middleware throw is answered the same way. A middleware replaces the
   * reply by returning a response or writing `ctx.res`, and an error raised
   * after it replaces it with the error's NAK. A route filter that throws
   * runs only the global middleware and is answered as a throw. An `ACK`,
   * and a payload that does not start with an MSH, get no reply unless a
   * handler or middleware gives one.
   *
   * A payload that is not UTF-8, or that the parser throws on, runs no
   * middleware: the handlers `onError()` registered observe the error, and
   * the reply is its NAK, `AE` unless the parser threw an `AckException`.
   * The NAK answers the MSH read from the bytes before the first CR; a
   * payload whose MSH is not UTF-8, an `ACK`, and one with no MSH get no
   * reply.
   *
   * `ctx.error` holds the latest error the message raised, and the reply
   * answers it.
   *
   * @throws {MllpServerError} `NO_PARSER` when no processor has been
   *   registered via `app.parser()`.
   */
  async handle(
    payload: Uint8Array,
    connection: ConnectionInfo
  ): Promise<Response | undefined> {
    if (!this.#processor) {
      throw new MllpServerError(MllpServerErrorCode.NO_PARSER);
    }

    // Reading is sync — only decode() and parse() run here. Transform and
    // compile are deferred to ctx.tree() / ctx.result().
    let request: MllpRequest;
    try {
      request = readRequest(payload, this.#processor);
    } catch (error) {
      return this.#reject(
        payload,
        error instanceof Error ? error : new Error(String(error)),
        connection
      );
    }
    const ctx = createContext({
      app: this.#options,
      connection,
      processor: this.#processor,
      request,
    });

    // The server answers neither an ACK, so two receivers never acknowledge
    // each other's acknowledgments, nor a payload with no MSH, which has no
    // MSH-10 to echo.
    const answerable =
      messageHeader(request.tree) !== undefined && ctx.messageType !== "ACK";
    const { serializer, ...defaults } = this.#options;
    const nakOf = (error: Error): Response | undefined =>
      answerable
        ? {
            raw: serializer(
              acknowledge(request.tree, {
                ...defaults,
                code: nakCode(error),
              })
            ),
          }
        : undefined;

    let terminal: Middleware;
    let middlewares: Middleware[];
    try {
      const matched = this.#router.match(ctx);
      middlewares = matched.middlewares;
      terminal = () => route(ctx, matched.handler, answerable);
    } catch (error) {
      middlewares = this.#router.globalMiddleware();
      terminal = () => {
        throw error;
      };
    }

    const answer = (error: Error): Response | undefined => {
      ctx.error = error;
      return nakOf(error);
    };

    await compose([...middlewares, terminal], answer)(ctx);
    return ctx.res;
  }

  /**
   * The NAK of `error` for a payload no middleware ran on, once the handlers
   * `onError()` registered have observed it.
   */
  async #reject(
    payload: Uint8Array,
    error: Error,
    connection: ConnectionInfo
  ): Promise<Response | undefined> {
    for (const handler of this.#errorHandlers) {
      await handler(error, connection);
    }
    const header = readHeader(payload);
    if (!header || queryValue(header, "MSH.9.1")?.value === "ACK") {
      return undefined;
    }
    const { serializer, ...defaults } = this.#options;
    return {
      raw: serializer(
        acknowledge(header, { ...defaults, code: nakCode(error) })
      ),
    };
  }
}

/**
 * Run the route handler, or reject a message no route matches. A handler
 * that returns no `Response` and leaves `ctx.res` as it was replies `AA`.
 * Neither default applies to a message that is not `answerable`.
 */
async function route(
  ctx: MessageContext,
  handler: Handler | undefined,
  answerable: boolean
): Promise<Response | undefined> {
  if (!handler) {
    if (!answerable) {
      return undefined;
    }
    throw new AckApplicationReject(
      "No route matches the message's type and trigger event (MSH-9).",
      {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
      }
    );
  }
  const before = ctx.res;
  const result = await handler(ctx);
  if (isResponse(result)) {
    return result;
  }
  if (ctx.res !== before) {
    return ctx.res;
  }
  return answerable ? ctx.ack() : undefined;
}

/** MSA-1 of the NAK `error` gets: an `AckException`'s code, else `AE`. */
function nakCode(error: Error): AckNakCode {
  return isAckException(error) ? error.code : AckCode.ApplicationError;
}
