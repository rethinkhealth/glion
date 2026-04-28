/**
 * Run a thenable and swallow any rejection. Used in cleanup paths
 * where the operation is fire-and-forget — `writer.abort()`,
 * `writer.close()`, `reader.cancel()`, `duplex.close()` all return
 * Promises that may reject for non-actionable reasons (the underlying
 * transport is already torn down, the stream is already errored,
 * etc.). Awaiting through this helper avoids both `unhandledRejection`
 * surfacing and the `prefer-await-to-then` lint warning.
 *
 * Internal to `@glion/mllp-client`.
 *
 * @module
 */

/**
 * Await a thenable, swallowing any rejection.
 *
 * Pass `Promise.resolve(maybePromise)` at the call site to coerce
 * adapters whose `close()` returns nothing (synchronous Node socket
 * destroy) and adapters whose `close()` returns a Promise (Workers
 * `socket.close()`) into the same shape. `Promise.resolve(value)`
 * is idempotent on existing promises, so this is zero-cost.
 */
export async function ignoreErrors(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    /* intentionally swallowed — caller is in a cleanup path */
  }
}
