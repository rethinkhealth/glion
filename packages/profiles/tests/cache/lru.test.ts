// oxlint-disable promise/prefer-await-to-then

import { createLruCache } from "../../src/cache/lru";

describe("createLruCache", () => {
  it("stores and retrieves a promise", async () => {
    const cache = createLruCache();
    const promise = Promise.resolve("hello");
    cache.set("key", promise);

    expect(cache.has("key")).toBe(true);
    expect(await cache.get("key")).toBe("hello");
  });

  it("returns undefined for missing keys", () => {
    const cache = createLruCache();
    expect(cache.get("missing")).toBeUndefined();
    expect(cache.has("missing")).toBe(false);
  });

  it("deletes a single entry", () => {
    const cache = createLruCache();
    cache.set("key", Promise.resolve("value"));

    expect(cache.delete("key")).toBe(true);
    expect(cache.has("key")).toBe(false);
    expect(cache.delete("key")).toBe(false);
  });

  it("clears all entries", () => {
    const cache = createLruCache();
    cache.set("a", Promise.resolve(1));
    cache.set("b", Promise.resolve(2));

    cache.clear();
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(false);
  });

  it("evicts least recently used entries when maxEntries is exceeded", () => {
    const cache = createLruCache({ maxEntries: 2 });
    cache.set("a", Promise.resolve(1));
    cache.set("b", Promise.resolve(2));
    cache.set("c", Promise.resolve(3));

    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("defaults to 10_000 maxEntries", () => {
    const cache = createLruCache();
    for (let i = 0; i < 100; i++) {
      cache.set(`key-${i}`, Promise.resolve(i));
    }
    expect(cache.has("key-0")).toBe(true);
    expect(cache.has("key-99")).toBe(true);
  });

  it("deduplicates concurrent access to the same promise", async () => {
    const cache = createLruCache();
    let resolvePromise: ((v: string) => void) | undefined;
    // oxlint-disable-next-line promise/avoid-new
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    cache.set("key", promise as Promise<unknown>);
    const p1 = cache.get("key");
    const p2 = cache.get("key");

    expect(p1).toBe(p2);

    resolvePromise?.("done");
    expect(await p1).toBe("done");
    expect(await p2).toBe("done");
  });
});
