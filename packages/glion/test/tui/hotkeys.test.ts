import { describe, expect, it, vi } from "vitest";

import { handleKey } from "../../src/tui/hotkeys.js";

function makeHandlers() {
  return {
    onQuit: vi.fn(),
    onReload: vi.fn(),
  };
}

describe("handleKey", () => {
  it("calls onReload for 'r'", () => {
    const handlers = makeHandlers();
    handleKey("r", handlers);
    expect(handlers.onReload).toHaveBeenCalled();
  });

  it("calls onQuit for 'q'", () => {
    const handlers = makeHandlers();
    handleKey("q", handlers);
    expect(handlers.onQuit).toHaveBeenCalled();
  });

  it("is case-insensitive", () => {
    const handlers = makeHandlers();
    handleKey("R", handlers);
    handleKey("Q", handlers);
    expect(handlers.onReload).toHaveBeenCalled();
    expect(handlers.onQuit).toHaveBeenCalled();
  });

  it("ignores unknown keys", () => {
    const handlers = makeHandlers();
    handleKey("x", handlers);
    handleKey("c", handlers);
    handleKey("?", handlers);
    expect(handlers.onReload).not.toHaveBeenCalled();
    expect(handlers.onQuit).not.toHaveBeenCalled();
  });
});
