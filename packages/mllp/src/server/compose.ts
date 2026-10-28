import { MllpServerError, MllpServerErrorCode } from "../errors";
import type { Context, Middleware, Response } from "./types";

/**
 * Compose an array of middleware into a single function that executes
 * them in onion-model order (like Hono/Koa).
 *
 * Each middleware receives (ctx, next). Calling next() proceeds to the
 * next middleware. A middleware that returns without calling next()
 * short-circuits the chain.
 *
 * A middleware gives the reply by returning a Response or by writing
 * `ctx.res`; a later one replaces it.
 *
 * A middleware that throws, or calls `next()` a second time
 * (`MllpServerError` `NEXT_CALLED_TWICE`), has that error passed to
 * `onError`, and the response `onError` returns or resolves to is written to
 * `ctx.res` before the chain goes on.
 * `onError` MUST NOT throw. The second `next()` call also throws that error
 * to its caller.
 */
export function compose(
  middlewares: Middleware[],
  onError: (
    error: Error
  ) => Response | undefined | Promise<Response | undefined>
): (ctx: Context) => Promise<void> {
  return async (ctx: Context): Promise<void> => {
    let index = -1;

    const fail = async (error: Error) => {
      ctx.res = await onError(error);
    };

    async function dispatch(i: number): Promise<void> {
      if (i <= index) {
        const misuse = new MllpServerError(
          MllpServerErrorCode.NEXT_CALLED_TWICE
        );
        await fail(misuse);
        throw misuse;
      }
      index = i;

      const middleware = middlewares[i];
      if (!middleware) {
        return;
      }
      try {
        const result = await middleware(ctx, () => dispatch(i + 1));
        if (isResponse(result)) {
          ctx.res = result;
        }
      } catch (error) {
        await fail(error instanceof Error ? error : new Error(String(error)));
      }
    }

    await dispatch(0);
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
