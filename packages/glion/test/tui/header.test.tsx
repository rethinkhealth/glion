import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

import { Header } from "../../src/tui/header.js";
import type { StoreState } from "../../src/tui/store.js";

function baseState(overrides: Partial<StoreState> = {}): StoreState {
  return {
    connections: new Map(),
    log: [],
    logEpoch: 0,
    msgPerSec: 0,
    port: 2575,
    status: "running",
    tls: false,
    ...overrides,
  };
}

describe("Header", () => {
  it("shows brand, port, and status", () => {
    const { lastFrame } = render(
      <Header state={baseState()} uptimeMs={123_000} />
    );
    const out = lastFrame();
    expect(out).toContain("glion");
    expect(out).toContain("2575");
    expect(out).toContain("running");
  });

  it("shows reloading status", () => {
    const { lastFrame } = render(
      <Header state={baseState({ status: "reloading" })} uptimeMs={0} />
    );
    expect(lastFrame()).toContain("reloading");
  });

  it("renders keyboard shortcut hints", () => {
    const { lastFrame } = render(<Header state={baseState()} uptimeMs={0} />);
    const out = lastFrame();
    expect(out).toContain("r");
    expect(out).toContain("reload");
    expect(out).toContain("q");
    expect(out).toContain("quit");
  });
});
