import { matchPattern, parsePattern } from "./types";
import type { Context, Handler, Middleware, RouteFilter } from "./types";

/**
 * A route entry: matcher + handler.
 */
interface Route {
  filter: (ctx: Context) => boolean;
  handler: Handler;
}

/**
 * A scoped middleware entry: matcher + middleware.
 */
interface ScopedMiddleware {
  filter: (ctx: Context) => boolean;
  middleware: Middleware;
}

/**
 * Result of matching a message against registered routes and middleware.
 */
export interface MatchResult {
  /** The matched handler, or undefined if no route matches */
  handler: Handler | undefined;
  /** Middleware that applies to this message (global + scoped matches) */
  middlewares: Middleware[];
}

/**
 * Create a matcher function from a string pattern.
 */
function patternMatcher(pattern: string): (ctx: Context) => boolean {
  const parsed = parsePattern(pattern);
  return (ctx) => matchPattern(parsed, ctx.messageType, ctx.triggerEvent);
}

/**
 * Pattern-matching router for HL7v2 message types.
 *
 * Routes are matched in registration order (first match wins).
 * Supports string patterns with wildcards or filter functions.
 *
 * String patterns:
 *
 * - `"ADT^A01"` — exact match
 * - `"ADT^*"` — any ADT message
 * - `"*"` — catch-all
 *
 * Filter functions:
 *
 * - `(ctx) => ctx.messageType === "ADT" && ctx.version === "2.5.1"`
 */
export class Router {
  readonly #routes: Route[] = [];
  readonly #globalMiddleware: Middleware[] = [];
  readonly #scopedMiddleware: ScopedMiddleware[] = [];

  /**
   * Register a route handler with a string pattern or filter function.
   */
  add(patternOrFilter: string | RouteFilter, handler: Handler): void {
    const filter =
      typeof patternOrFilter === "string"
        ? patternMatcher(patternOrFilter)
        : patternOrFilter;

    this.#routes.push({ filter, handler });
  }

  /**
   * Register global middleware (runs for all messages).
   * When `prepend` is true, the middleware is inserted at the front
   * of the chain so it executes outermost (first in, last out).
   */
  addMiddleware(middleware: Middleware, prepend?: boolean): void;
  /**
   * Register scoped middleware with a string pattern or filter function.
   */
  addMiddleware(
    patternOrFilter: string | RouteFilter,
    middleware: Middleware
  ): void;
  addMiddleware(
    patternOrFilterOrMiddleware: string | RouteFilter | Middleware,
    middlewareOrPrepend?: Middleware | boolean
  ): void {
    // Global middleware: addMiddleware(fn) or addMiddleware(fn, true)
    if (
      typeof patternOrFilterOrMiddleware === "function" &&
      (middlewareOrPrepend === undefined ||
        typeof middlewareOrPrepend === "boolean")
    ) {
      if (middlewareOrPrepend === true) {
        this.#globalMiddleware.unshift(
          patternOrFilterOrMiddleware as Middleware
        );
      } else {
        this.#globalMiddleware.push(patternOrFilterOrMiddleware as Middleware);
      }
      return;
    }

    // Scoped middleware: addMiddleware(pattern/filter, fn)
    if (typeof middlewareOrPrepend === "function") {
      const middleware = middlewareOrPrepend;
      const filter =
        typeof patternOrFilterOrMiddleware === "string"
          ? patternMatcher(patternOrFilterOrMiddleware)
          : (patternOrFilterOrMiddleware as RouteFilter);

      this.#scopedMiddleware.push({ filter, middleware });
    }
  }

  /**
   * Match a context against registered routes and middleware.
   * Returns the first matching handler and all applicable middleware.
   */
  match(ctx: Context): MatchResult {
    // Find first matching route (registration order)
    let handler: Handler | undefined;
    for (const route of this.#routes) {
      if (route.filter(ctx)) {
        handler = route.handler;
        break;
      }
    }

    // Collect applicable middleware: global + matching scoped
    const middlewares: Middleware[] = [...this.#globalMiddleware];
    for (const scoped of this.#scopedMiddleware) {
      if (scoped.filter(ctx)) {
        middlewares.push(scoped.middleware);
      }
    }

    return { handler, middlewares };
  }
}
