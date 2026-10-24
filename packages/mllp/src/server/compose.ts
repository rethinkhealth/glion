import type { Context, Middleware, Response } from "./types";

const NEXT_CALLED_TWICE = "next() called multiple times";

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
 * response `onError` returns is written to `ctx.res`. `onError` MUST NOT
 * throw. `next()` throws only when a middleware calls it a second time; the
 * composed function then rejects with that error once the chain has run.
 */
export function compose(
  middlewares: Middleware[],
  onError: (error: Error) => Response | undefined
): (ctx: Context) => Promise<void> {
  return async (ctx: Context): Promise<void> => {
    let index = -1;
    let misused = false;

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        misused = true;
        throw new Error(NEXT_CALLED_TWICE);
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
      if (isResponse(result)) {
        ctx.res = result;
      }
    }

    await dispatch(0);
    if (misused) {
      throw new Error(NEXT_CALLED_TWICE);
    }
  };
}

/** Whether `value` is a {@link Response}. */
export function isResponse(value: unknown): value is Response {
  return (
    typeof value === "object" &&
    value !== null &&
    "raw" in value &&
    typeof value.raw === "string"
  );
}
