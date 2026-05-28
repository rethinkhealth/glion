import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWatcher } from "../../src/parent/watcher.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "glion-watch-"));
});

afterEach(async () => {
  await rm(dir, { force: true, recursive: true });
});

describe("createWatcher", () => {
  it("debounces a burst of changes into a single event", async () => {
    const file = join(dir, "a.ts");
    await writeFile(file, "initial");

    const onChange = vi.fn();
    const watcher = await createWatcher([dir], { debounceMs: 50 });
    watcher.onChange(onChange);

    await delay(100); // let chokidar finish its initial scan

    await writeFile(file, "one");
    await delay(10);
    await writeFile(file, "two");
    await delay(150);

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].files).toContain(file);

    await watcher.close();
  });

  it("emits a separate event for each burst beyond the debounce window", async () => {
    const file = join(dir, "b.ts");
    await writeFile(file, "x");
    const onChange = vi.fn();
    const watcher = await createWatcher([dir], { debounceMs: 40 });
    watcher.onChange(onChange);
    await delay(100);

    await writeFile(file, "1");
    await delay(120);
    await writeFile(file, "2");
    await delay(120);

    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    await watcher.close();
  });

  it("picks up added and removed files", async () => {
    const onChange = vi.fn();
    const watcher = await createWatcher([dir], { debounceMs: 40 });
    watcher.onChange(onChange);
    await delay(200);

    const newFile = join(dir, "added.ts");
    await writeFile(newFile, "hello");
    await delay(200);
    expect(onChange).toHaveBeenCalled();
    const callsAfterAdd = onChange.mock.calls.length;

    await unlink(newFile);
    await delay(200);
    expect(onChange.mock.calls.length).toBeGreaterThan(callsAfterAdd);

    await watcher.close();
  });

  it("onChange returns an unsubscribe function", async () => {
    const file = join(dir, "c.ts");
    await writeFile(file, "x");
    const watcher = await createWatcher([dir], { debounceMs: 40 });
    const onChange = vi.fn();
    const unsub = watcher.onChange(onChange);
    await delay(100);

    unsub();
    await writeFile(file, "y");
    await delay(120);
    expect(onChange).not.toHaveBeenCalled();

    await watcher.close();
  });

  it("close() cancels a pending debounce timer", async () => {
    const file = join(dir, "d.ts");
    await writeFile(file, "x");
    const onChange = vi.fn();
    const watcher = await createWatcher([dir], { debounceMs: 200 });
    watcher.onChange(onChange);
    await delay(100);

    await writeFile(file, "y");
    // Close BEFORE the debounce fires.
    await watcher.close();
    await delay(300);
    expect(onChange).not.toHaveBeenCalled();
  });
});
