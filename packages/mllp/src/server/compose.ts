import type { Context, Middleware } from "./types";

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
 */
export function compose(
  middlewares: Middleware[]
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
      const result = await middleware(ctx, () => dispatch(i + 1));

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
