/**
 * Subscribe to an `AbortSignal` and run a callback once if it
 * aborts. Returns a disposer that unsubscribes — call it from a
 * `finally` block so we never leak listeners.
 *
 * If the signal is already aborted at subscription time, the
 * callback fires synchronously and the returned disposer is a
 * no-op. This collapses the "aborted vs aborting" branch every
 * caller would otherwise need to write by hand.
 *
 * Internal to `@glion/mllp-client`.
 *
 * @module
 */

/**
 * Subscribe `onAbort` to fire once when `signal` aborts. Returns a
 * disposer that removes the listener.
 *
 * @example
 *   ```ts
 *   const dispose = subscribeAbort(signal, () => socket.destroy());
 *   try {
 *     await waitForReady(socket);
 *   } finally {
 *     dispose();
 *   }
 *   ```;
 */
export function subscribeAbort(
  signal: AbortSignal,
  onAbort: () => void
): () => void {
  if (signal.aborted) {
    onAbort();
    return noop;
  }
  signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}

function noop(): void {
  /* nothing to dispose */
}
