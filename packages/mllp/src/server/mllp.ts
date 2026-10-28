import hl7v2LintRequiredMessageHeader from "@glion/lint-required-message-header";
import { hl7v2Parser } from "@glion/parser";
import { encodeBytes } from "@glion/util-charset";
import { unified } from "unified";

import { compose } from "./compose";
import { createContext } from "./context";
import { parseRequest } from "./request";
import { Router } from "./router";
import type {
  Context,
  EnvArgs,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  Response,
  RouteFilter,
} from "./types";

/**
 * Routing fields from the message that caused an error.
 * Attached to errors `Mllp.handle()` rejects with, so that callers
 * (e.g., `serve()`) can include message context in error callbacks.
 */
export interface MessageInfo {
  readonly messageType: string;
  readonly triggerEvent: string;
  readonly messageStructure: string;
  readonly version: string;
  readonly controlId: string;
}

/**
 * Internal store for associating message routing info with errors.
 * Uses a WeakMap so error objects can be garbage-collected normally.
 */
const errorMessageInfo = new WeakMap<Error, MessageInfo>();

/**
 * Retrieve the {@link MessageInfo} associated with an error thrown
 * by `Mllp.handle()`. Returns `undefined` for errors that did not
 * originate from message processing (e.g., lifecycle callback errors).
 */
export function getMessageInfo(error: unknown): MessageInfo | undefined {
  // A WeakMap lookup; a non-error key simply misses and yields undefined.
  return errorMessageInfo.get(error as Error);
}

/**
 * The processor of an app given none: `@glion/parser`, and
 * `@glion/lint-required-message-header` reporting a fatal message for a
 * message that does not start with an MSH.
 */
const defaultProcessor: Hl7v2Processor = unified()
  .use(hl7v2Parser)
  .use(hl7v2LintRequiredMessageHeader, ["error"])
  .freeze();

/**
 * MLLP application for HL7v2 messaging: routes and middleware over one
 * message at a time, on any runtime.
 *
 * `E` is the type of `ctx.env`, what the runtime passes to `handle()`.
 *
 * @example
 *   ```typescript
 *   import { Mllp } from "@glion/mllp";
 *
 *   const app = new Mllp().on("ADT^A01", async (ctx) => {
 *     await save(ctx.req.tree);
 *     return { raw: "..." };
 *   });
 *   ```;
 */
export class Mllp<E = unknown> {
  readonly #router = new Router<E>();
  #processor: Hl7v2Processor = defaultProcessor;
  #errorHandler: ErrorHandler<E> | undefined;

  /**
   * Replace the HL7v2 processor that reads each message: a unified
   * `Processor`, such as `parseHL7v2` from `@glion/hl7v2` or
   * `unified().use(hl7v2Parser).use(...)`. Calling it again replaces the
   * previous one. Without it, the app reads with `@glion/parser` and
   * `@glion/lint-required-message-header`.
   *
   * The processor MUST report a fatal message for a message that does not
   * start with an MSH, as `@glion/lint-required-message-header` does at
   * `"error"`: the app routes only a message that starts with one.
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
   * - `(ctx) => ctx.req.header.messageCode === "ADT" && ctx.req.header.version
   *   === "2.5.1"`
   */
  on(patternOrFilter: string | RouteFilter<E>, handler: Handler<E>): this {
    this.#router.add(patternOrFilter, handler);
    return this;
  }

  /**
   * Register a global error handler.
   *
   * Called when middleware or a handler throws. Without an error handler,
   * the error is re-thrown to the caller (e.g. `serve()`).
   *
   * If the error handler returns a response, it is used as the reply.
   * If the error handler itself throws, the new error is re-thrown.
   */
  onError(handler: ErrorHandler<E>): this {
    this.#errorHandler = handler;
    return this;
  }

  /**
   * Process one message through the middleware chain and router, and return
   * the response encoded as UTF-8, or `undefined` for none. `payload` is the
   * message without MLLP framing; `env` becomes `ctx.env`. Bound to the app,
   * so it can be passed on as a function.
   *
   * 1. Decode the payload as UTF-8, parse it, and run the processor's
   *    transformers, its lint rules among them.
   * 2. Route match, on `ctx.req.header`.
   * 3. Middleware, then the route handler.
   * 4. Compile — only when a handler calls `ctx.req.result()`.
   *
   * A payload that is not UTF-8, that the processor throws on, or that the
   * processor reports a fatal message for runs no middleware and no route:
   * `handle()` rejects with the `CharsetError`, the processor's error, or the
   * first fatal message.
   */
  readonly handle = async (
    payload: Uint8Array,
    ...[given]: EnvArgs<E>
  ): Promise<Uint8Array | undefined> => {
    // EnvArgs<E> leaves `env` out only when E admits undefined.
    const env = given as E;
    const request = await parseRequest(payload, this.#processor);
    const fatal = request.file.messages.find((message) => message.fatal);
    if (fatal) {
      throw fatal;
    }
    const ctx = createContext({ env, request });

    // oxlint-disable-next-line typescript/no-invalid-void-type
    let response: Response | undefined | void;
    try {
      // Match route and collect middleware
      const match = this.#router.match(ctx);
      const middlewares = [...match.middlewares];

      // Add the handler as the terminal middleware
      if (match.handler) {
        const handler = match.handler;
        middlewares.push((handlerCtx: Context<E>) => handler(handlerCtx));
      }

      // Compose and execute
      await compose(middlewares)(ctx);

      response = ctx.res;
    } catch (error) {
      response = await this.#handleError(
        error instanceof Error ? error : new Error(String(error)),
        ctx
      );
    }
    return response ? encodeBytes(response.raw) : undefined;
  };

  /**
   * Handle an error during message processing.
   *
   * If a custom error handler is registered, delegates to it.
   * If the error handler itself throws, re-throws the error handler's error.
   * If no error handler is registered, re-throws the original error.
   *
   * In both re-throw cases, message routing fields are attached to the
   * error via {@link getMessageInfo} so callers can include message
   * context in error reporting.
   *
   * Callers (e.g. `serve()`) are responsible for catching these errors
   * and deciding how to handle them at the transport level.
   */
  async #handleError(
    err: Error,
    ctx: Context<E>
    // oxlint-disable-next-line typescript/no-invalid-void-type
  ): Promise<Response | undefined | void> {
    const { header } = ctx.req;
    const info: MessageInfo = {
      controlId: header.controlId,
      messageStructure: header.messageStructure,
      messageType: header.messageCode,
      triggerEvent: header.triggerEvent,
      version: header.version,
    };

    if (this.#errorHandler) {
      try {
        return await this.#errorHandler(err, ctx);
      } catch (handlerError) {
        const e =
          handlerError instanceof Error
            ? handlerError
            : new Error(String(handlerError));
        errorMessageInfo.set(e, info);
        throw e;
      }
    }

    errorMessageInfo.set(err, info);
    throw err;
  }
}
