/**
 * The queue of sends: the head is the send in progress, the rest wait their
 * turn in `enter()` order.
 *
 * @module
 */

/** A place in the queue. */
export interface Turn {
  /** Resolves when the send may start. `null` when it may start now. */
  readonly wait: Promise<unknown> | null;
}

interface Entry extends Turn {
  resolve(): void;
  reject(error: unknown): void;
}

export interface Queue {
  /** How many turns wait behind the head. */
  readonly pending: number;
  /** Resolves once every turn has left. At once when none is in. */
  drained(): Promise<void>;
  /** Takes the last place. */
  enter(): Turn;
  /** Gives `turn`'s place up. Starts the next send when `turn` was the head. */
  leave(turn: Turn): void;
  /** Rejects every waiting `Turn` with `error`. The head is not touched. */
  rejectWaiting(error: unknown): void;
}

export function createQueue(): Queue {
  const entries: Entry[] = [];
  let empty: PromiseWithResolvers<void> | null = null;
  return {
    async drained() {
      if (entries.length === 0) {
        return;
      }
      empty ??= Promise.withResolvers();
      await empty.promise;
    },
    enter() {
      const { promise, resolve, reject } = Promise.withResolvers();
      const entry: Entry = {
        reject,
        resolve: () => resolve(null),
        wait: entries.length === 0 ? null : promise,
      };
      entries.push(entry);
      return entry;
    },
    leave(turn) {
      const place = entries.indexOf(turn as Entry);
      if (place === -1) {
        throw new Error(
          "A turn left the queue twice. This is a bug in @glion/mllp-client; please report it."
        );
      }
      entries.splice(place, 1);
      if (place === 0) {
        entries[0]?.resolve();
      }
      if (entries.length === 0) {
        empty?.resolve();
        empty = null;
      }
    },
    get pending() {
      return Math.max(0, entries.length - 1);
    },
    rejectWaiting(error) {
      for (const entry of entries.slice(1)) {
        entry.reject(error);
      }
    },
  };
}
