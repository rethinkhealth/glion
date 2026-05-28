import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

import type { Event } from "../../src/events.js";
import { LogPane } from "../../src/tui/log-pane.js";
import type { LogEntry } from "../../src/tui/store.js";

function toEntries(events: Event[]): LogEntry[] {
  return events.map((event, i) => ({ event, id: i + 1 }));
}

describe("LogPane", () => {
  it("renders msg events with trigger and ack", () => {
    const entries = toEntries([
      {
        ack: "AA",
        conn: 1,
        control: "C1",
        ms: 3.2,
        pattern: "ADT^A01",
        remote: "10.0.0.5:8080",
        t: "msg",
        trigger: "ADT^A01",
        ts: "2026-04-05T12:34:56.000Z",
      },
    ]);
    const { lastFrame } = render(<LogPane entries={entries} epoch={0} />);
    expect(lastFrame()).toContain("ADT^A01");
    expect(lastFrame()).toContain("AA");
  });

  it("renders error events distinctly", () => {
    const entries = toEntries([{ message: "boom", t: "error", ts: "x" }]);
    const { lastFrame } = render(<LogPane entries={entries} epoch={0} />);
    expect(lastFrame()).toContain("boom");
  });

  it("renders ready events with hostname and port", () => {
    // Operators need to visually confirm what address the server
    // bound to — especially when config overrides the mode default
    // (e.g. `glion dev` with `hostname: "0.0.0.0"`). Showing just
    // ":2575" leaves ambiguity about exposure. The hostname is part
    // of the ready event payload precisely so the TUI can render it.
    const entries = toEntries([
      {
        hostname: "0.0.0.0",
        pid: 1234,
        port: 2575,
        t: "ready",
        tls: false,
        ts: "2026-04-05T12:34:56.000Z",
      },
    ]);
    const { lastFrame } = render(<LogPane entries={entries} epoch={0} />);
    const out = lastFrame() ?? "";
    expect(out).toContain("ready");
    expect(out).toContain("0.0.0.0");
    expect(out).toContain("2575");
  });

  it("streams every entry (append-only, Static commits each exactly once)", () => {
    const events: Event[] = Array.from({ length: 20 }, (_, i) => ({
      message: `m${i}`,
      t: "warning" as const,
      ts: "x",
    }));
    const { lastFrame } = render(
      <LogPane entries={toEntries(events)} epoch={0} />
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("m0");
    expect(out).toContain("m10");
    expect(out).toContain("m19");
  });
});
