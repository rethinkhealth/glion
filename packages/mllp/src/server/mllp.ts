import { MllpError } from "@glion/mllp-transport";

import { compose } from "./compose";
import { createContext } from "./context";
import { Router } from "./router";
import type {
  ConnectionInfo,
  Context,
  ErrorHandler,
  Handler,
  Hl7v2Processor,
  Middleware,
  Response,
  RouteFilter,
} from "./types";

/**
 * Routing fields from the message that caused an error.
 * Attached to errors thrown by `Mllp.handle()` so that callers
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
export function getMessageInfo(error: Error): MessageInfo | undefined {
  return errorMessageInfo.get(error);
}

/**
 * MLLP application for HL7v2 messaging.
 *
 * A pure routing and middleware engine with no TCP/server concerns.
 * Use `serve()` to bind this to a TCP server.
 *
 * @example
 *   ```typescript
 *   import { Mllp } from "@glion/mllp";
 *   import { parseHL7v2 } from "@glion/hl7v2";
 *
 *   const app = new Mllp().parser(parseHL7v2).on("ADT^A01", async (ctx) => {
 *     const tree = await ctx.tree();
 *     return { raw: "..." };
 *   });
 *   ```;
 */
export class Mllp {
  readonly #router = new Router();
  #processor: Hl7v2Processor | undefined;
  #errorHandler: ErrorHandler | undefined;

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
   * Register a global error handler.
   *
   * Called when middleware or a handler throws. Without an error handler,
   * the error is re-thrown to the caller (e.g. `serve()`).
   *
   * If the error handler returns a response, it is used as the reply.
   * If the error handler itself throws, the new error is re-thrown.
   */
  onError(handler: ErrorHandler): this {
    this.#errorHandler = handler;
    return this;
  }

  /**
   * Process a raw HL7v2 message through the middleware chain and router.
   * This is the integration point — analogous to Hono's `fetch()`.
   *
   * The pipeline is lazy (see ADR-0013):
   * 1. Parse (sync, fast) — always runs, extracts routing fields
   * 2. Route match — uses pre-transform routing fields
   * 3. If no match → return undefined (no transform/compile cost)
   * 4. Transform/compile — only when handlers access ctx.tree()/ctx.result()
   *
   * Throws `MllpError` if no processor has been registered via `app.parser()`.
   */
  async handle(
    raw: string,
    bytes: Uint8Array,
    connection: ConnectionInfo
    // oxlint-disable-next-line typescript/no-invalid-void-type
  ): Promise<Response | undefined | void> {
    if (!this.#processor) {
      throw new MllpError(
        "ERR_NO_PARSER",
        "No parser registered. Call app.parser() before handling messages."
      );
    }

    // Context creation is sync — only parse() runs here.
    // Transform and compile are deferred to ctx.tree() / ctx.result().
    const ctx = createContext({
      bytes,
      connection,
      processor: this.#processor,
      raw,
    });

    try {
      // Match route and collect middleware
      const match = this.#router.match(ctx);
      const middlewares = [...match.middlewares];

      // Add the handler as the terminal middleware
      if (match.handler) {
        const handler = match.handler;
        middlewares.push((handlerCtx: Context) => handler(handlerCtx));
      }

      // Compose and execute
      await compose(middlewares)(ctx);

      return ctx.res;
    } catch (error) {
      return this.#handleError(
        error instanceof Error ? error : new Error(String(error)),
        ctx
      );
    }
  }

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
    ctx: Context
    // oxlint-disable-next-line typescript/no-invalid-void-type
  ): Promise<Response | undefined | void> {
    const info: MessageInfo = {
      controlId: ctx.controlId,
      messageStructure: ctx.messageStructure,
      messageType: ctx.messageType,
      triggerEvent: ctx.triggerEvent,
      version: ctx.version,
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
