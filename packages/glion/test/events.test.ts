import { describe, expect, it } from "vitest";

import type { Event } from "../src/events.js";
import { encode, eventLevel, parseLine } from "../src/events.js";

describe("events codec", () => {
  it("round-trips a ready event", () => {
    const event: Event = {
      hostname: "127.0.0.1",
      pid: 1234,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "2026-04-04T12:00:00.000Z",
    };
    const line = encode(event);
    expect(line.endsWith("\n")).toBe(true);
    expect(parseLine(line.trim())).toEqual(event);
  });

  it("round-trips a msg event", () => {
    const event: Event = {
      ack: "AA",
      conn: 1,
      control: "MSG00001",
      ms: 3.2,
      pattern: "ADT^A01",
      remote: "127.0.0.1:54321",
      t: "msg",
      trigger: "ADT^A01",
      ts: "2026-04-04T12:00:00.000Z",
    };
    expect(parseLine(encode(event).trim())).toEqual(event);
  });

  it("round-trips a fatal event with nested context", () => {
    const event: Event = {
      context: { field: "port", issue: "expected number" },
      kind: "config-invalid",
      message: "bad port",
      t: "fatal",
      ts: "2026-04-04T12:00:00.000Z",
    };
    expect(parseLine(encode(event).trim())).toEqual(event);
  });

  it("parseLine returns null on malformed JSON", () => {
    expect(parseLine("{not json")).toBeNull();
    expect(parseLine("")).toBeNull();
  });

  it("parseLine returns null when the discriminator is missing or unknown", () => {
    expect(parseLine(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(parseLine(JSON.stringify({ t: "unknown-kind" }))).toBeNull();
  });
});

describe("eventLevel", () => {
  // Fixed-severity events: the level comes from the type table.
  it("maps each fixed-severity event type to its declared level", () => {
    const cases: [Event, string][] = [
      [
        {
          hostname: "127.0.0.1",
          pid: 1,
          port: 1,
          t: "ready",
          tls: false,
          ts: "t",
        },
        "info",
      ],
      [{ id: 1, remote: "r", t: "conn.open", ts: "t" }, "debug"],
      [{ id: 1, t: "conn.close", ts: "t" }, "debug"],
      [
        {
          ack: null,
          conn: 1,
          control: "c",
          ms: 0,
          pattern: null,
          remote: "r",
          t: "msg",
          trigger: "T",
          ts: "t",
        },
        "info",
      ],
      [{ message: "e", t: "error", ts: "t" }, "error"],
      [{ reason: "manual", t: "reload", ts: "t" }, "info"],
      [{ t: "closing", ts: "t" }, "info"],
      [{ t: "closed", ts: "t" }, "info"],
      [{ kind: "child-crashed", message: "m", t: "fatal", ts: "t" }, "fatal"],
      [{ count: 1, t: "dropped", ts: "t" }, "warn"],
      [{ message: "w", t: "warning", ts: "t" }, "warn"],
      [{ code: 0, t: "exit", ts: "t" }, "info"],
    ];
    for (const [event, expected] of cases) {
      expect(eventLevel(event)).toBe(expected);
    }
  });

  // `log` is the only variant whose level is an instance-level property.
  it("reads the instance-level level off log events", () => {
    expect(eventLevel({ level: "warn", message: "m", t: "log", ts: "t" })).toBe(
      "warn"
    );
    expect(
      eventLevel({ level: "error", message: "m", t: "log", ts: "t" })
    ).toBe("error");
  });
});
