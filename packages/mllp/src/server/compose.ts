import { MllpServerError, MllpServerErrorCode } from "../errors";
import { isReply } from "./reply";
import type { Reply } from "./reply";
import type { Context, Middleware } from "./types";

/**
 * Compose an array of middleware into a single function that executes
 * them in onion-model order (like Hono/Koa).
 *
 * Each middleware receives (ctx, next). Calling next() proceeds to the
 * next middleware. A middleware that returns without calling next()
 * short-circuits the chain.
 *
 * A middleware gives the reply by returning a `Reply`, or `null` for no
 * reply, or by writing `ctx.res`; a later one replaces it. Returning nothing
 * leaves the reply as it is.
 *
 * A middleware that throws, returns a value that is not a reply
 * (`MllpServerError` `INVALID_REPLY`), or calls `next()` a second time
 * (`NEXT_CALLED_TWICE`) has that error passed to `onError`, and the reply
 * `onError` returns is written to `ctx.res`. `onError` MUST NOT throw. The
 * second `next()` call also throws that error to its caller.
 */
export function compose<E>(
  middlewares: Middleware<E>[],
  onError: (error: Error) => Reply | undefined
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
          if (!isReply(result)) {
            throw new MllpServerError(MllpServerErrorCode.INVALID_REPLY);
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
