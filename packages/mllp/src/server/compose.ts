import { MllpServerError, MllpServerErrorCode } from "../errors";
import { isResponse } from "./response";
import type { MllpResponse } from "./response";
import type { Context, Middleware } from "./types";

/**
 * Compose an array of middleware into a single function that executes
 * them in onion-model order (like Hono/Koa).
 *
 * Each middleware receives (ctx, next). Calling next() proceeds to the
 * next middleware. A middleware that returns without calling next()
 * short-circuits the chain.
 *
 * A middleware gives the response by returning an `MllpResponse`, or `null` for
 * no response, or by writing `ctx.res`; a later one replaces it. Returning
 * nothing leaves the response as it is.
 *
 * A middleware that throws, returns a value that is not a response
 * (`MllpServerError` `INVALID_RESPONSE`), or calls `next()` a second time
 * (`NEXT_CALLED_TWICE`) has that error passed to `onError`, and the response
 * `onError` returns is written to `ctx.res`. `onError` MUST NOT throw. The
 * second `next()` call also throws that error to its caller.
 */
export function compose<E>(
  middlewares: Middleware<E>[],
  onError: (error: Error) => MllpResponse | undefined
): (ctx: Context<E>) => Promise<void> {
  return async (ctx: Context<E>): Promise<void> => {
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
        const result: unknown = await middleware(ctx, () => dispatch(i + 1));
        if (result === null) {
          ctx.res = undefined;
        } else if (result !== undefined) {
          if (!isResponse(result)) {
            throw new MllpServerError(MllpServerErrorCode.INVALID_RESPONSE);
          }
          ctx.res = result;
        }
      } catch (error) {
        await fail(error instanceof Error ? error : new Error(String(error)));
      }
    }

    await dispatch(0);
  };
}
