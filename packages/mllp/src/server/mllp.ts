import {
  AckApplicationReject,
  AckCode,
  AckException,
  Hl7ErrorCode,
  Severity,
} from "@glion/ack";

import { MllpServerError, MllpServerErrorCode } from "../errors";
import { compose } from "./compose";
import { createContext } from "./context";
import { Router } from "./router";
import type {
  ConnectionInfo,
  Context,
  Handler,
  Hl7v2Processor,
  Middleware,
  Response,
  RouteFilter,
} from "./types";

/** MSA-3 of the reply to an error that is not an `AckException`: Table 0357 code 207. */
const APPLICATION_INTERNAL_ERROR = "Application internal error";

/** MSA-3 of the reply to a message no route matches: Table 0357 code 200. */
const UNSUPPORTED_MESSAGE_TYPE = "Unsupported message type";

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
  #processor: Hl7v2Processor | undefined;

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
   * - It returns nothing: `AA`.
   * - It throws an `AckException`: its `code` in MSA-1 and its `text` in MSA-3.
   * - It throws anything else: `AE` with MSA-3 `Application internal error`.
   * - No route matches: `AR` with MSA-3 `Unsupported message type`.
   *
   * A middleware throw is answered the same way, unless the route handler has
   * already replied; then that reply stands. A payload that does not decode
   * or parse, or a route filter that throws, runs only the global middleware
   * and is answered as a throw. An error's `message` is never sent. An `ACK`
   * gets no reply unless a handler or middleware gives one: an
   * acknowledgment is never acknowledged.
   *
   * `ctx.error` holds the first error the message raised. `await next()`
   * never throws.
   *
   * @throws {MllpServerError} `NO_PARSER` when no processor has been
   *   registered via `app.parser()`.
   */
  async handle(
    payload: Uint8Array,
    connection: ConnectionInfo
  ): Promise<Response | undefined> {
    if (!this.#processor) {
      throw new MllpServerError(
        MllpServerErrorCode.NO_PARSER,
        "No parser registered. Call app.parser() before handling messages."
      );
    }

    // Context creation is sync — only decode() and parse() run here.
    // Transform and compile are deferred to ctx.tree() / ctx.result().
    const ctx = createContext({
      connection,
      payload,
      processor: this.#processor,
    });

    let handler: Handler | undefined;
    let middlewares: Middleware[] = [];
    if (!ctx.error) {
      try {
        ({ handler, middlewares } = this.#router.match(ctx));
      } catch (error) {
        ctx.error = toError(error);
      }
    }
    if (ctx.error) {
      middlewares = this.#router.globalMiddleware();
    }

    // Set once the route handler's step has replied; a later middleware
    // throw keeps that reply, since the sender would resend a message that
    // was already processed.
    let replied = false;
    const answer = (error: Error): Response | undefined => {
      ctx.error ??= error;
      return replied ? ctx.res : acknowledgeError(ctx, error);
    };
    const terminal: Middleware = async (terminalCtx) => {
      const before = terminalCtx.res;
      let reply: Response | undefined;
      try {
        reply = await route(terminalCtx, handler);
        reply ??=
          terminalCtx.res === before ? accept(terminalCtx) : terminalCtx.res;
      } catch (error) {
        reply = answer(toError(error));
      }
      replied = true;
      return reply;
    };

    await compose([...middlewares, terminal], answer)(ctx);
    return ctx.res;
  }
}

/**
 * Run the route handler, or raise the message's own error, or reject a
 * message no route matches.
 */
async function route(
  ctx: Context,
  handler: Handler | undefined
): Promise<Response | undefined> {
  if (ctx.error) {
    throw ctx.error;
  }
  if (!handler) {
    throw new AckApplicationReject(
      `No route matches ${ctx.messageType}^${ctx.triggerEvent}.`,
      {
        errorCode: Hl7ErrorCode.UnsupportedMessageType,
        severity: Severity.Error,
        text: UNSUPPORTED_MESSAGE_TYPE,
      }
    );
  }
  return (await handler(ctx)) ?? undefined;
}

/** `AA`, or no reply to an `ACK`. */
function accept(ctx: Context): Response | undefined {
  return ctx.messageType === "ACK" ? undefined : ctx.ack();
}

/** The NAK `error` describes, or no reply to an `ACK`. */
function acknowledgeError(ctx: Context, error: Error): Response | undefined {
  if (ctx.messageType === "ACK") {
    return undefined;
  }
  if (error instanceof AckException) {
    return ctx.ack({ code: error.code, text: error.text });
  }
  return ctx.ack({
    code: AckCode.ApplicationError,
    text: APPLICATION_INTERNAL_ERROR,
  });
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
