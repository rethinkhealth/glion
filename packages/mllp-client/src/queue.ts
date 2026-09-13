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
  /** Takes the last place. */
  enter(): Turn;
  /** Gives `turn`'s place up. Starts the next send when `turn` was the head. */
  leave(turn: Turn): void;
  /** Rejects every waiting `Turn` with `error`. The head is not touched. */
  rejectWaiting(error: unknown): void;
}

export function createQueue(): Queue {
  const entries: Entry[] = [];
  return {
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
      entries.splice(place, 1);
      if (place === 0) {
        entries[0]?.resolve();
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
