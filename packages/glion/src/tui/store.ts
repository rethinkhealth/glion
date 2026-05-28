import { setImmediate as nodeSetImmediate } from "node:timers";

import type { Event } from "../events.js";

/** An event tagged with a monotonic id so React can use stable keys. */
export interface LogEntry {
  id: number;
  event: Event;
}

export interface ConnInfo {
  id: number;
  remote: string;
  openedAt: string;
}

export type UiStatus = "starting" | "running" | "reloading" | "crashed";

export interface StoreState {
  status: UiStatus;
  port: number | null;
  tls: boolean;
  connections: Map<number, ConnInfo>;
  /** Messages processed per second (rolling 5-second window). */
  msgPerSec: number;
  /**
   * Bounded append-only event log. Holds up to `LOG_COMPACT_THRESHOLD`
   * entries; when that fills, the oldest entries are dropped down to
   * the most recent `LOG_RECENT_CAP` and `logEpoch` advances.
   *
   * Unlike the previous implementation, this array stays small — no
   * growing slot count, no O(n) spread on a multi-million-entry
   * array. Ink's `<Static>` tracks which indices it has already
   * committed to the terminal scrollback; bumping `logEpoch` forces
   * Static to remount so its counter resyncs to the newly-compacted
   * array's (shorter) length.
   */
  log: LogEntry[];
  /**
   * Increments each time the log is compacted. Consumed by the TUI as
   * the `key` on the Static component so it remounts on compaction.
   * Terminal scrollback above the live region is unaffected — those
   * lines were already committed by the terminal and are not
   * re-rendered.
   */
  logEpoch: number;
}

export interface Store {
  getState(): StoreState;
  dispatch(event: Event): void;
  subscribe(listener: () => void): () => void;
  /** Call periodically (e.g. every second) to decay msg/s when idle. */
  tick(): void;
}

/**
 * How many recent entries survive a compaction. Older entries are
 * dropped from the in-memory log but remain in the terminal's native
 * scrollback — Static committed those lines once and never repaints
 * them, so they stay visible to the user if they scroll up.
 *
 * Exported so unit tests can assert boundary behaviour symbolically
 * rather than hard-coding the magic number — if the cap ever needs
 * tuning, tests don't have to track it separately.
 */
export const LOG_RECENT_CAP = 2000;

/**
 * Soft upper bound on `state.log.length`. When the log grows past
 * this threshold, it is compacted down to `LOG_RECENT_CAP` entries
 * and `state.logEpoch` advances. The gap between the two constants
 * is the compaction amortization window: with these values the log
 * is compacted roughly once per 1000 dispatched events, and the
 * per-dispatch spread cost stays bounded at O(LOG_COMPACT_THRESHOLD).
 *
 * Wihtout this approach, the implementation will have NO upper bound — the
 * array would grow one slot per event forever, and each dispatch would have an
 * O(n) spread. At 2.88M events (100 msg/s × 8h) the per-dispatch cost became
 * hundreds of millions of pointer copies, locking up the TUI. This bound
 * eliminates that cliff.
 *
 * Exported for tests (see note on LOG_RECENT_CAP above).
 */
export const LOG_COMPACT_THRESHOLD = 3000;

/**
 * Event store backing the dev TUI.
 *
 * Tracks just enough state to render the single-column log view: an
 * append-only event stream plus top-line status. Notifications are
 * coalesced to one per event-loop turn so a burst of messages
 * triggers a single render.
 */
export function createStore(): Store {
  const state: StoreState = {
    connections: new Map(),
    log: [],
    logEpoch: 0,
    msgPerSec: 0,
    port: null,
    status: "starting",
    tls: false,
  };
  const listeners = new Set<() => void>();

  let nextId = 1;
  let notifyScheduled = false;

  // Rolling msg/s: timestamps of recent `msg` events over a 5-second
  // sliding window. On each new msg, expired entries are pruned and the
  // rate is recomputed. The array stays tiny (bounded by throughput ×
  // window size) and the prune is a single while-loop on the head.
  const RATE_WINDOW_MS = 5000;
  const msgTimestamps: number[] = [];

  const updateRate = (): void => {
    const cutoff = Date.now() - RATE_WINDOW_MS;
    while (msgTimestamps.length > 0 && (msgTimestamps[0] as number) < cutoff) {
      msgTimestamps.shift();
    }
    const span =
      msgTimestamps.length > 1
        ? ((msgTimestamps.at(-1) as number) - (msgTimestamps[0] as number)) /
          1000
        : 0;
    state.msgPerSec = span > 0 ? Math.round(msgTimestamps.length / span) : 0;
  };

  const notify = (): void => {
    if (notifyScheduled) {
      return;
    }
    notifyScheduled = true;
    nodeSetImmediate(() => {
      notifyScheduled = false;
      for (const l of listeners) {
        l();
      }
    });
  };

  function dispatch(event: Event): void {
    switch (event.t) {
      case "ready": {
        state.status = "running";
        state.port = event.port;
        state.tls = event.tls;
        break;
      }
      case "conn.open": {
        state.connections.set(event.id, {
          id: event.id,
          openedAt: event.ts,
          remote: event.remote,
        });
        // Connection lifecycle is tracked in state but not logged —
        // it's infrastructure noise that clutters the event stream.
        notify();
        return;
      }
      case "conn.close": {
        state.connections.delete(event.id);
        notify();
        return;
      }
      case "reload": {
        state.status = "reloading";
        state.connections.clear();
        break;
      }
      case "msg": {
        msgTimestamps.push(Date.now());
        updateRate();
        break;
      }
      case "fatal": {
        state.status = "crashed";
        break;
      }
      default: {
        break;
      }
    }

    // New array reference on every logged event. Ink's <Static> uses
    // `useMemo([items, index])` with reference equality on `items` —
    // an in-place push is invisible to it, so each dispatch has to
    // produce a fresh array. The spread is O(state.log.length) and
    // the bound above guarantees that length stays below
    // LOG_COMPACT_THRESHOLD, making the spread effectively O(1)
    // (bounded by a small constant) no matter how many events have
    // been dispatched over the lifetime of the session.
    state.log = [...state.log, { event, id: nextId }];
    nextId += 1;

    if (state.log.length > LOG_COMPACT_THRESHOLD) {
      // Compact: keep only the most recent LOG_RECENT_CAP entries and
      // bump the epoch. Consumers use `logEpoch` as a React `key` on
      // the Static component so it remounts — Ink's Static tracks how
      // many items it has committed via internal useState, and if we
      // shrunk the array without remounting, its index would point
      // past the new array end and nothing further would render.
      state.log = state.log.slice(-LOG_RECENT_CAP);
      state.logEpoch += 1;
    }
    notify();
  }

  return {
    dispatch,
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    tick() {
      const prev = state.msgPerSec;
      updateRate();
      if (state.msgPerSec !== prev) {
        notify();
      }
    },
  };
}
