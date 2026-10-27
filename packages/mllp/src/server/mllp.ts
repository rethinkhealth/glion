import {
  AckApplicationReject,
  AckCode,
  Hl7ErrorCode,
  isAckException,
  Severity,
} from "@glion/ack";
import type { AckNakCode } from "@glion/ack";
import { toHl7v2 } from "@glion/to-hl7v2";
import { nowDTM } from "@glion/util-timestamp";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { acknowledge } from "./acknowledge";
import { compose, isResponse } from "./compose";
import { createContext } from "./context";
import type { MessageContext } from "./context";
import { readMessage } from "./message";
import { Router } from "./router";
import type {
  ConnectionInfo,
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
  readonly #options: MllpOptions;
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
   * runs only the global middleware and is answered as a throw. A payload
   * that does not decode or parse runs only the global middleware, and its
   * reply is the NAK of the latest error whatever they return or write: a
   * message whose content was never read is never accepted. An `ACK`, and a
   * payload that does not start with an MSH, get no reply unless a handler
   * or middleware gives one.
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
    const message = readMessage(payload, this.#processor);
    const ctx = createContext({
      app: this.#options,
      connection,
      message,
      processor: this.#processor,
    });

    // The server answers neither an ACK, so two receivers never acknowledge
    // each other's acknowledgments, nor a payload with no MSH, which has no
    // MSH-10 to echo.
    const answerable =
      message.header.children.length > 0 && ctx.messageType !== "ACK";
    const nakOf = (error: Error): Response | undefined =>
      answerable
        ? {
            raw: toHl7v2(
              acknowledge(message.header, {
                ...this.#options,
                code: nakCode(error),
              })
            ),
          }
        : undefined;

    // A payload that did not decode or parse: its content was never read.
    const received = message.error;
    let nak = received && nakOf(received);
    let terminal: Middleware = noReply;
    let middlewares: Middleware[] = [];
    if (received) {
      // Content never read is never accepted: the middleware observe the
      // message, and the latest error's NAK is the reply.
      ctx.res = nak;
      middlewares = this.#router
        .globalMiddleware()
        .map((middleware) => keepingReply(middleware, () => nak));
    } else {
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
    }

    const answer = (error: Error): Response | undefined => {
      ctx.error = error;
      nak = nakOf(error);
      return nak;
    };

    await compose([...middlewares, terminal], answer)(ctx);
    return ctx.res;
  }
}

/** A terminal that leaves the reply as it is. */
function noReply(): undefined {
  return undefined;
}

/**
 * `middleware`, its return value dropped and the current `nak()` kept as the
 * reply.
 */
function keepingReply(
  middleware: Middleware,
  nak: () => Response | undefined
): Middleware {
  return async (ctx, next) => {
    try {
      await middleware(ctx, next);
    } finally {
      ctx.res = nak();
    }
  };
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
