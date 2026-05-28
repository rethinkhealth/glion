import { describe, expect, it } from "vitest";

import {
  createStore,
  LOG_COMPACT_THRESHOLD,
  LOG_RECENT_CAP,
} from "../../src/tui/store.js";

describe("createStore", () => {
  it("handles ready events", () => {
    const store = createStore();
    store.dispatch({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "x",
    });
    expect(store.getState().status).toBe("running");
    expect(store.getState().port).toBe(2575);
  });

  it("tracks open and close connections", () => {
    const store = createStore();
    store.dispatch({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "x",
    });
    store.dispatch({
      id: 1,
      remote: "1.1.1.1:1",
      t: "conn.open",
      ts: "x",
    });
    store.dispatch({
      id: 2,
      remote: "2.2.2.2:2",
      t: "conn.open",
      ts: "x",
    });
    expect(store.getState().connections.size).toBe(2);
    store.dispatch({ id: 1, t: "conn.close", ts: "x" });
    expect(store.getState().connections.size).toBe(1);
  });

  it("keeps every dispatched event in the append-only log", () => {
    const store = createStore();
    for (let i = 0; i < 5; i += 1) {
      store.dispatch({
        message: `m${i}`,
        t: "warning",
        ts: "x",
      });
    }
    const log = store.getState().log;
    expect(log.length).toBe(5);
    const first = log[0]?.event;
    expect(first?.t).toBe("warning");
    if (first?.t === "warning") {
      expect(first.message).toBe("m0");
    }
  });

  it("does not compact while log.length is at or below LOG_COMPACT_THRESHOLD", () => {
    const store = createStore();
    // Dispatch exactly LOG_COMPACT_THRESHOLD events. The guard in
    // store.ts is `if (state.log.length > LOG_COMPACT_THRESHOLD)`,
    // so filling to the threshold must NOT trigger compaction.
    for (let i = 0; i < LOG_COMPACT_THRESHOLD; i += 1) {
      store.dispatch({
        message: `m${i}`,
        t: "warning",
        ts: "x",
      });
    }
    expect(store.getState().log).toHaveLength(LOG_COMPACT_THRESHOLD);
    expect(store.getState().logEpoch).toBe(0);
  });

  it("compacts to exactly LOG_RECENT_CAP entries on the threshold-crossing event", () => {
    const store = createStore();
    // Fill to threshold first — no compaction yet.
    for (let i = 0; i < LOG_COMPACT_THRESHOLD; i += 1) {
      store.dispatch({
        message: `m${i}`,
        t: "warning",
        ts: "x",
      });
    }
    expect(store.getState().logEpoch).toBe(0);
    // One more event takes length past the threshold, triggering
    // compaction. After compaction the log must hold exactly
    // LOG_RECENT_CAP entries (not "roughly" or "at most") and epoch
    // must advance by exactly one.
    store.dispatch({
      message: "crossover",
      t: "warning",
      ts: "x",
    });
    expect(store.getState().log).toHaveLength(LOG_RECENT_CAP);
    expect(store.getState().logEpoch).toBe(1);
  });

  it("retains monotonic IDs through compaction — oldest surviving id is deterministic", () => {
    const store = createStore();
    // Dispatch LOG_COMPACT_THRESHOLD + 1 events so compaction fires
    // exactly once.
    const total = LOG_COMPACT_THRESHOLD + 1;
    for (let i = 0; i < total; i += 1) {
      store.dispatch({
        message: `m${i}`,
        t: "warning",
        ts: "x",
      });
    }
    const log = store.getState().log;
    expect(log).toHaveLength(LOG_RECENT_CAP);

    // IDs are assigned 1..total; after keeping the last LOG_RECENT_CAP
    // entries, the oldest surviving id is `total - LOG_RECENT_CAP + 1`.
    const expectedFirstId = total - LOG_RECENT_CAP + 1;
    expect(log[0]?.id).toBe(expectedFirstId);
    expect(log.at(-1)?.id).toBe(total);

    // Every id in the retained window must be strictly increasing —
    // compaction preserves order, never reshuffles.
    for (let i = 1; i < log.length; i += 1) {
      expect(log[i]?.id).toBe((log[i - 1]?.id ?? 0) + 1);
    }
  });

  it("stays bounded through many compactions and keeps the most recent event", () => {
    const store = createStore();
    // Dispatch enough to trigger multiple compaction cycles. Each
    // cycle reclaims (LOG_COMPACT_THRESHOLD - LOG_RECENT_CAP + 1)
    // slots, so 50_000 events produce ~48 compactions with these
    // defaults — more than enough to exercise the code path
    // repeatedly and verify no state leaks or accumulates.
    const count = 50_000;
    for (let i = 0; i < count; i += 1) {
      store.dispatch({
        message: `m${i}`,
        t: "warning",
        ts: "x",
      });
    }

    const state = store.getState();
    // Between compactions the log is capped at LOG_COMPACT_THRESHOLD;
    // immediately after compaction it's at LOG_RECENT_CAP. At any
    // observation point, `length` must lie in [LOG_RECENT_CAP, LOG_COMPACT_THRESHOLD].
    expect(state.log.length).toBeLessThanOrEqual(LOG_COMPACT_THRESHOLD);
    expect(state.log.length).toBeGreaterThanOrEqual(LOG_RECENT_CAP);
    expect(state.logEpoch).toBeGreaterThan(0);

    // The most recent event must still be there — bounded growth is
    // worthless if recent entries get dropped.
    const last = state.log.at(-1);
    expect(last?.event.t).toBe("warning");
    if (last && last.event.t === "warning") {
      expect(last.event.message).toBe(`m${count - 1}`);
    }
    expect(last?.id).toBe(count);
  });

  it("assigns monotonically-increasing ids to log entries", () => {
    const store = createStore();
    store.dispatch({ message: "a", t: "warning", ts: "x" });
    store.dispatch({ message: "b", t: "warning", ts: "x" });
    store.dispatch({ message: "c", t: "warning", ts: "x" });
    const ids = store.getState().log.map((e) => e?.id);
    expect(ids).toEqual([ids[0], (ids[0] ?? 0) + 1, (ids[0] ?? 0) + 2]);
  });

  it("flips status to reloading and clears connections on reload, preserves log history", () => {
    const store = createStore();
    store.dispatch({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "x",
    });
    store.dispatch({
      id: 1,
      remote: "1.1.1.1:1",
      t: "conn.open",
      ts: "x",
    });

    store.dispatch({
      reason: "file-change",
      t: "reload",
      ts: "x",
    });
    expect(store.getState().status).toBe("reloading");
    expect(store.getState().connections.size).toBe(0);
    expect(store.getState().log.length).toBeGreaterThan(0);
  });

  it("flips status to crashed on fatal", () => {
    const store = createStore();
    store.dispatch({
      kind: "child-crashed",
      message: "boom",
      t: "fatal",
      ts: "x",
    });
    expect(store.getState().status).toBe("crashed");
  });
});
