/**
 * What a client reports as it runs, and the listeners that receive it.
 *
 * @module
 */

import type { MllpClientError } from "../errors";

export interface MllpClientEvents {
  /** The connection is open and ready for messages. */
  connect(): void;
  /**
   * The client is done and will not connect again. `error` is the failure the
   * reconnect policy did not recover from, or `null` when it closes normally.
   */
  close(error: MllpClientError | null): void;
}

/** The name of one thing a client reports. */
export type MllpClientEvent = keyof MllpClientEvents;

/** A listener for `event`. */
export type MllpClientListener<E extends MllpClientEvent> = MllpClientEvents[E];

/**
 * The listeners of a client.
 *
 * A listener that throws propagates to whoever triggered the event, the same
 * as Node's `EventEmitter`.
 */
export abstract class MllpClientEmitter {
  readonly #listeners = new Map<
    MllpClientEvent,
    Set<MllpClientEvents[MllpClientEvent]>
  >();

  /** Adds a listener for `event`, and returns the client so calls chain. */
  on<E extends MllpClientEvent>(
    event: E,
    listener: MllpClientListener<E>
  ): this {
    const listeners = this.#listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(event, listeners);
    return this;
  }

  /** Removes a listener added with {@link on}. */
  off<E extends MllpClientEvent>(
    event: E,
    listener: MllpClientListener<E>
  ): this {
    this.#listeners.get(event)?.delete(listener);
    return this;
  }

  /** Calls every listener for `event`, in the order they were added. */
  protected emit<E extends MllpClientEvent>(
    event: E,
    ...args: Parameters<MllpClientEvents[E]>
  ): void {
    for (const listener of this.#listeners.get(event) ?? []) {
      (listener as (...a: Parameters<MllpClientEvents[E]>) => void)(...args);
    }
  }
}
