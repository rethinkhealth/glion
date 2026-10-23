import type { Context, Middleware, Response } from "./types";

/**
 * Compose an array of middleware into a single function that executes
 * them in onion-model order (like Hono/Koa).
 *
 * Each middleware receives (ctx, next). Calling next() proceeds to the
 * next middleware. If a middleware returns a Response without
 * calling next(), it short-circuits the chain.
 *
 * Response handling follows Hono's pattern: return values are written
 * to ctx.res, and middleware can also set ctx.res directly.
 * Last write wins.
 *
 * A middleware that throws has its error passed to `onError`, and the
 * response `onError` returns is written to `ctx.res`. `next()` never throws.
 * `onError` MUST NOT throw.
 */
export function compose(
  middlewares: Middleware[],
  onError: (error: Error) => Response | undefined
): (ctx: Context) => Promise<void> {
  return async (ctx: Context): Promise<void> => {
    let index = -1;

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      if (i >= middlewares.length) {
        return;
      }

      const middleware = middlewares[i] as Middleware;
      let result: Awaited<ReturnType<Middleware>>;
      try {
        result = await middleware(ctx, () => dispatch(i + 1));
      } catch (error) {
        result = onError(
          error instanceof Error ? error : new Error(String(error))
        );
      }

      // If middleware returned a response, set ctx.res (last write wins)
      if (
        result &&
        typeof result === "object" &&
        "raw" in result &&
        typeof result.raw === "string"
      ) {
        ctx.res = result;
      }
    }

    await dispatch(0);
  };
}
