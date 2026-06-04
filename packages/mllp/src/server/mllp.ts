import { MllpServerError, MllpServerErrorCode } from "../errors";
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
export function getMessageInfo(error: unknown): MessageInfo | undefined {
  // A WeakMap lookup; a non-error key simply misses and yields undefined.
  return errorMessageInfo.get(error as Error);
}

/** Characters that would break MLLP framing or HL7 field structure. */
const UNSAFE_NAK_CHARS = /[\r\n|^~\\&]/g;
const MAX_NAK_REASON = 250;

/**
 * Last-resort error NAK, returned when no `onError` handler is registered so an
 * errored message never gets silence on the wire — the HTTP-500 equivalent.
 *
 * Deliberately minimal: a bare `MSA|AE` acknowledgment that echoes the control
 * id when the message was readable. Rich, fully-echoed ACK/NAK construction
 * (correct `MSH` echoing, `ERR` segments, code selection) is
 * `@glion/mllp-ack`'s job — register it (or `onError`) to replace this floor.
 */
function buildDefaultNak(err: Error, ctx: Context): Response {
  const { controlId } = ctx;
  const reason =
    err.message
      .replace(UNSAFE_NAK_CHARS, " ")
      .trim()
      .slice(0, MAX_NAK_REASON) || "Message could not be processed";
  const version = ctx.version || "2.5.1";
  return {
    raw: `MSH|^~\\&|||||||ACK|${controlId}|P|${version}\rMSA|AE|${controlId}|${reason}`,
  };
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
   * Called when middleware or a handler throws. Without an error handler, a
   * minimal default NAK is returned so the sender is never left hanging (the
   * HTTP-500 equivalent); see {@link buildDefaultNak}.
   *
   * If the error handler returns a response, it is used as the reply. If the
   * error handler itself throws, the new error is re-thrown to `serve()`.
   */
  onError(handler: ErrorHandler): this {
    this.#errorHandler = handler;
    return this;
  }

  /**
   * Process de-framed MLLP payload bytes through the middleware chain and
   * router. This is the integration point — analogous to Hono's `fetch()` —
   * and is runtime-agnostic: every transport adapter passes the raw payload
   * here, so decode + parse happen once, in the core.
   *
   * The pipeline is lazy (see ADR-0013):
   *
   * 1. Decode (UTF-8) + parse (sync, fast) — always runs, extracts routing fields.
   *    Neither throws out of band: a non-UTF-8 or unparseable payload becomes
   *    `ctx.error` and is re-thrown from inside the chain, so the ack
   *    middleware can NAK it (and `onError`, else the default NAK floor,
   *    handles it when no ack middleware is registered).
   * 2. Route match — uses pre-transform routing fields
   * 3. Transform/compile — only when handlers access ctx.tree()/ctx.result()
   *
   * Throws `MllpServerError` (`NO_PARSER`) if no processor has been registered
   * via `app.parser()`.
   */
  async handle(
    payload: Uint8Array,
    connection: ConnectionInfo
    // oxlint-disable-next-line typescript/no-invalid-void-type
  ): Promise<Response | undefined | void> {
    if (!this.#processor) {
      throw new MllpServerError(
        MllpServerErrorCode.NO_PARSER,
        "No parser registered. Call app.parser() before handling messages."
      );
    }

    // createContext decodes (UTF-8) and parses, and is total: a non-UTF-8 or
    // unparseable payload never throws — it is recorded on ctx.error.
    const ctx = createContext({
      connection,
      payload,
      processor: this.#processor,
    });

    try {
      const match = this.#router.match(ctx);
      const middlewares = [...match.middlewares];

      if (ctx.error) {
        // A payload we couldn't decode or parse has nothing to route. Surface
        // the failure as the innermost step of the chain so wrapping middleware
        // (e.g. the ack middleware) can turn it into a NAK — the same path a
        // thrown handler error takes. If nothing in the chain catches it, it
        // propagates to #handleError (the app's onError, else re-thrown).
        const failure = ctx.error;
        middlewares.push(() => {
          throw failure;
        });
      } else if (match.handler) {
        const handler = match.handler;
        middlewares.push((handlerCtx: Context) => handler(handlerCtx));
      }

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
   * If a custom error handler is registered, delegates to it. If that handler
   * itself throws, the new error is re-thrown (with routing fields attached via
   * {@link getMessageInfo}) for `serve()` to report at the transport level.
   *
   * If no error handler is registered, returns a minimal default NAK so the
   * sender is never left hanging — the HTTP-500 equivalent. See
   * {@link buildDefaultNak}; register `onError` or `@glion/mllp-ack` to replace
   * it.
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

    // No custom error handler: never leave the sender hanging. Return a minimal
    // last-resort NAK (the HTTP-500 equivalent); @glion/mllp-ack or onError
    // replaces it with a richer response.
    return buildDefaultNak(err, ctx);
  }
}
