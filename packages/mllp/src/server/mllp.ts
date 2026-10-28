import {
  AckApplicationReject,
  AckCode,
  Hl7ErrorCode,
  isAckException,
  Severity,
} from "@glion/ack";
import type { AckNakCode } from "@glion/ack";
import hl7v2LintRequiredMessageHeader from "@glion/lint-required-message-header";
import { hl7v2Parser } from "@glion/parser";
import { toHl7v2 } from "@glion/to-hl7v2";
import { value as queryValue } from "@glion/util-query";
import { nowDTM } from "@glion/util-timestamp";
import { unified } from "unified";

import { acknowledge } from "./acknowledge";
import { compose, isResponse } from "./compose";
import { createContext } from "./context";
import type { MessageContext } from "./context";
import { parseRequest, salvageHeader } from "./request";
import type { MllpRequest } from "./request";
import { Router } from "./router";
import type {
  EnvArgs,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  MllpOptions,
  Response,
  RouteFilter,
} from "./types";

/**
 * MLLP application for HL7v2 messaging: routes and middleware over one
 * message at a time, on any runtime.
 *
 * `E` is the type of `ctx.env`, what the runtime passes to `handle()`.
 *
 * @example
 *   ```typescript
 *   import { AckCode } from "@glion/ack";
 *   import { Mllp } from "@glion/mllp";
 *
 *   const app = new Mllp()
 *     .on("ADT^A01", async (ctx) => {
 *       await save(ctx.ast); // replies AA
 *     })
 *     .on("ORM^O01", (ctx) => ctx.ack({ code: AckCode.CommitAccept }));
 *   ```;
 */
/**
 * The processor of an app given none: `@glion/parser`, and
 * `@glion/lint-required-message-header` reporting a fatal message for a
 * message that does not start with an MSH.
 */
const defaultProcessor: Hl7v2Processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2LintRequiredMessageHeader, ["error"])
  .freeze();

export class Mllp<E = unknown> {
  readonly #router = new Router<E>();
  readonly #errorHandlers: ErrorHandler<E>[] = [];
  readonly #options: MllpOptions & Required<Pick<MllpOptions, "serializer">>;
  #processor: Hl7v2Processor = defaultProcessor;

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
   * Replace the HL7v2 processor that reads each message: a unified
   * `Processor`, such as `parseHL7v2` from `@glion/hl7v2` or
   * `unified().use(hl7v2Parser).use(...)`. Calling it again replaces the
   * previous one. Without it, the app reads with `@glion/parser` and
   * `@glion/lint-required-message-header`.
   *
   * The processor MUST report a fatal message for a message that does not
   * start with an MSH, as `@glion/lint-required-message-header` does at
   * `"error"`: the app answers only a message that starts with one.
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
  use(middleware: Middleware<E>, options?: { prepend?: boolean }): this;
  use(
    patternOrFilter: string | RouteFilter<E>,
    middleware: Middleware<E>
  ): this;
  use(
    first: string | RouteFilter<E> | Middleware<E>,
    second?: Middleware<E> | { prepend?: boolean }
  ): this {
    // Scoped middleware: use('ADT^*', middleware) or use(filter, middleware)
    if (
      (typeof first === "string" || typeof first === "function") &&
      typeof second === "function"
    ) {
      this.#router.addMiddleware(first as string | RouteFilter<E>, second);
      return this;
    }

    // Standard middleware: use((ctx, next) => { ... })
    if (typeof first === "function") {
      const prepend =
        second && typeof second === "object" ? second.prepend : false;
      this.#router.addMiddleware(first as Middleware<E>, prepend);
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
  on(patternOrFilter: string | RouteFilter<E>, handler: Handler<E>): this {
    this.#router.add(patternOrFilter, handler);
    return this;
  }

  /**
   * Register a handler for every error a message raises: a payload that is
   * not UTF-8 (`CharsetError`), a processor throw, the processor's first
   * fatal message, and the error of a route filter, middleware or handler.
   * The handler observes the error; it does not change the response. Each
   * handler registered runs, in the order registered, when the error is
   * raised, and `handle()` waits for it.
   */
  onError(handler: ErrorHandler<E>): this {
    this.#errorHandlers.push(handler);
    return this;
  }

  /**
   * Process one message through the middleware chain and router, and return
   * the reply, or `undefined` for none. `payload` is the message without MLLP
   * framing; `env` becomes `ctx.env`. Bound to the app, so it can be passed
   * on as a function.
   *
   * 1. Decode the payload as UTF-8, parse it, and run the processor's
   *    transformers, its lint rules among them.
   * 2. Route match, on the routing fields of the tree.
   * 3. Middleware, then the route handler.
   * 4. Compile — only when a handler calls `ctx.result()`.
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
   * runs only the global middleware and is answered as a throw. An `ACK`
   * gets no reply unless a handler or middleware gives one.
   *
   * A payload that is not UTF-8, that the processor throws on, or that the
   * processor reports a fatal message for runs no middleware: the reply is
   * the NAK of the error, or of the first fatal message, `AE` unless the
   * processor threw an `AckException`. The NAK answers the MSH read from the
   * bytes before the first CR; a payload whose MSH is not UTF-8, an `ACK`,
   * and one with no MSH get no reply.
   *
   * `ctx.error` holds the latest error the message raised, and the reply
   * answers it. The handlers `onError()` registered observe every error.
   */
  readonly handle = async (
    payload: Uint8Array,
    ...[given]: EnvArgs<E>
  ): Promise<Response | undefined> => {
    // EnvArgs<E> leaves `env` out only when E admits undefined.
    const env = given as E;
    let request: MllpRequest;
    try {
      request = await parseRequest(payload, this.#processor);
    } catch (error) {
      return this.#reject(
        payload,
        error instanceof Error ? error : new Error(String(error)),
        env
      );
    }
    const fatal = request.file.messages.find((message) => message.fatal);
    if (fatal) {
      return this.#reject(payload, fatal, env);
    }
    const ctx = createContext({
      app: this.#options,
      env,
      processor: this.#processor,
      request,
    });

    // The server does not answer an ACK, so two receivers never acknowledge
    // each other's acknowledgments.
    const answerable = ctx.messageType !== "ACK";
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

    let terminal: Middleware<E>;
    let middlewares: Middleware<E>[];
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

    const answer = async (error: Error): Promise<Response | undefined> => {
      ctx.error = error;
      await this.#observe(error, env);
      return nakOf(error);
    };

    await compose([...middlewares, terminal], answer)(ctx);
    return ctx.res;
  };

  /** Runs each handler `onError()` registered on `error`, in order. */
  async #observe(error: Error, env: E): Promise<void> {
    for (const handler of this.#errorHandlers) {
      await handler(error, env);
    }
  }

  /**
   * The NAK of `error` for a payload no middleware ran on, once the handlers
   * `onError()` registered have observed it.
   */
  async #reject(
    payload: Uint8Array,
    error: Error,
    env: E
  ): Promise<Response | undefined> {
    await this.#observe(error, env);
    const header = salvageHeader(payload);
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
async function route<E>(
  ctx: MessageContext<E>,
  handler: Handler<E> | undefined,
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
