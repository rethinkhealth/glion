import { rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import type { ResultPromise } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import type { Event } from "../../src/events.js";

const fixturesDir = resolve(fileURLToPath(import.meta.url), "..", "fixtures");

const binPath = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "..",
  "dist",
  "index.js"
);

let currentProc: ResultPromise | null = null;
let triggerFile: string | null = null;

afterEach(async () => {
  if (currentProc) {
    currentProc.kill("SIGTERM");
    try {
      await currentProc;
    } catch {
      // killing is expected to produce a non-zero exit
    }
    currentProc = null;
  }
  if (triggerFile) {
    await rm(triggerFile, { force: true });
    triggerFile = null;
  }
});

/**
 * In non-TTY mode `glion dev` writes clean JSON lines to stdout — the
 * same format as `glion start` — so a single parser handles both.
 * Collects up to `count` events whose `t` field matches `kind`.
 */
function readUntilEventCount(
  proc: ResultPromise,
  kind: Event["t"],
  count: number,
  timeoutMs = 15_000
): Promise<Event[]> {
  let resolvePromise!: (value: Event[]) => void;
  let rejectPromise!: (reason: unknown) => void;
  // oxlint-disable-next-line promise/avoid-new, no-shadow
  const promise = new Promise<Event[]>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const matches: Event[] = [];
  const timer = setTimeout(() => {
    rejectPromise(
      new Error(
        `timeout waiting for ${count} '${kind}' events (got ${matches.length})`
      )
    );
  }, timeoutMs);
  let buffer = "";
  proc.stdout?.on("data", (chunk: Buffer | string) => {
    buffer += chunk.toString();
    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) {
        try {
          const event = JSON.parse(line) as Event;
          if (event.t === kind) {
            matches.push(event);
            if (matches.length >= count) {
              clearTimeout(timer);
              resolvePromise(matches);
              return;
            }
          }
        } catch {
          // ignore malformed lines
        }
      }
      newlineIdx = buffer.indexOf("\n");
    }
  });
  return promise;
}

describe("glion dev e2e", () => {
  it("restarts the child after a watched file changes", async () => {
    const fixtureDir = resolve(fixturesDir, "minimal");
    // Mutate a dedicated trigger file under ./src (the default watched
    // directory) so we never touch the committed fixture's entry file.
    triggerFile = resolve(fixtureDir, "src", "_trigger.ts");

    currentProc = execa(process.execPath, [binPath, "dev"], {
      cwd: fixtureDir,
      reject: false,
    });

    // Listen for both ready events up front so we don't miss the second
    // one between wait points.
    const bothReadiesPromise = readUntilEventCount(currentProc, "ready", 2);

    // Wait for the first ready to confirm both server and watcher are up.
    // (The watcher is created before the supervisor starts, and chokidar's
    // internal subscription is established synchronously, so by the time
    // the child emits `ready` the watcher is guaranteed to be listening.)
    await readUntilEventCount(currentProc, "ready", 1);

    // Touch the trigger file to fire the debounced reload.
    await writeFile(triggerFile, `// touched ${Date.now()}\n`);

    const readies = await bothReadiesPromise;
    expect(readies.length).toBeGreaterThanOrEqual(2);
  }, 30_000);
});
