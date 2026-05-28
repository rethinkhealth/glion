import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

import { App } from "../../src/tui/app.js";
import { createStore } from "../../src/tui/store.js";

describe("App", () => {
  it("renders the brand, port, status, and shortcut hints", () => {
    const store = createStore();
    store.dispatch({
      hostname: "127.0.0.1",
      pid: 1,
      port: 2575,
      t: "ready",
      tls: false,
      ts: "x",
    });

    const { lastFrame } = render(<App store={store} startedAt={Date.now()} />);
    const out = lastFrame();
    expect(out).toContain("glion");
    expect(out).toContain("2575");
    expect(out).toContain("running");
    expect(out).toContain("reload");
    expect(out).toContain("quit");
  });

  it("renders recent log entries below the header", () => {
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
      ack: "AA",
      conn: 1,
      control: "C1",
      ms: 3,
      pattern: "ADT^A01",
      remote: "127.0.0.1:54321",
      t: "msg",
      trigger: "ADT^A01",
      ts: "x",
    });

    const { lastFrame } = render(<App store={store} startedAt={Date.now()} />);
    expect(lastFrame()).toContain("ADT^A01");
  });
});
