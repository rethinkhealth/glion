// oxlint-disable promise/prefer-await-to-then

import { createLruCache } from "../src/cache/lru";
import type { ProfileStoreConfig } from "../src/store";
import { createProfileStore } from "../src/store";

// Minimal manifest for testing
const testManifest: Record<string, () => Promise<{ value: string }>> = {
  "v2.5/BAR": () => Promise.resolve({ value: "bar-raw" }),
  "v2.5/FOO": () => Promise.resolve({ value: "foo-raw" }),
  "v2.6/FOO": () => Promise.resolve({ value: "foo-v26-raw" }),
};

const baseConfig: ProfileStoreConfig<{ value: string }> = {
  manifest: testManifest,
  namespace: "test",
};

describe("createProfileStore", () => {
  describe("load", () => {
    it("loads a profile from the manifest", async () => {
      const store = createProfileStore(baseConfig, createLruCache());
      const result = await store.load("2.5", "FOO");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("throws for unknown profile", async () => {
      const store = createProfileStore(baseConfig, createLruCache());
      await expect(store.load("2.5", "UNKNOWN")).rejects.toThrow(
        "Unknown test profile: v2.5/UNKNOWN"
      );
    });

    it("caches repeated loads (same reference)", async () => {
      const store = createProfileStore(baseConfig, createLruCache());
      const a = await store.load("2.5", "FOO");
      const b = await store.load("2.5", "FOO");
      expect(a).toBe(b);
    });

    it("calls manifest factory only once per key", async () => {
      const factory = vi.fn(() => Promise.resolve({ value: "spied" }));
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: { "v2.5/SPY": factory },
        namespace: "test",
      };
      const store = createProfileStore(config, createLruCache());

      await store.load("2.5", "SPY");
      await store.load("2.5", "SPY");
      expect(factory).toHaveBeenCalledOnce();
    });
  });

  describe("compile", () => {
    it("applies compile transform to raw data", async () => {
      const config: ProfileStoreConfig<{ value: string }, string> = {
        compile: (raw) => raw.value.toUpperCase(),
        manifest: testManifest,
        namespace: "test",
      };
      const store = createProfileStore(config, createLruCache());
      const result = await store.load("2.5", "FOO");
      expect(result).toBe("FOO-RAW");
    });
  });

  describe("resolveId", () => {
    it("resolves alias IDs before loading", async () => {
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: testManifest,
        namespace: "test",
        resolveId: (_version, id) => (id === "ALIAS" ? "FOO" : undefined),
      };
      const store = createProfileStore(config, createLruCache());
      const result = await store.load("2.5", "ALIAS");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("passes through when resolveId returns undefined", async () => {
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: testManifest,
        namespace: "test",
        resolveId: (_version, _id) => undefined as string | undefined,
      };
      const store = createProfileStore(config, createLruCache());
      const result = await store.load("2.5", "FOO");
      expect(result).toEqual({ value: "foo-raw" });
    });
  });

  describe("cache operations", () => {
    it("has() reflects cache state", async () => {
      const store = createProfileStore(baseConfig, createLruCache());
      expect(store.has("2.5", "FOO")).toBe(false);
      await store.load("2.5", "FOO");
      expect(store.has("2.5", "FOO")).toBe(true);
    });

    it("evict() removes a cached entry", async () => {
      const store = createProfileStore(baseConfig, createLruCache());
      await store.load("2.5", "FOO");
      store.evict("2.5", "FOO");
      expect(store.has("2.5", "FOO")).toBe(false);
    });

    it("reset() flushes only this store's entries from shared cache", async () => {
      const cache = createLruCache();

      const storeA = createProfileStore(
        { ...baseConfig, namespace: "a" },
        cache
      );
      const storeB = createProfileStore(
        { ...baseConfig, namespace: "b" },
        cache
      );

      await storeA.load("2.5", "FOO");
      await storeB.load("2.5", "FOO");

      expect(cache.has("a:2.5/FOO")).toBe(true);
      expect(cache.has("b:2.5/FOO")).toBe(true);

      storeA.reset();
      expect(cache.has("a:2.5/FOO")).toBe(false);
      expect(cache.has("b:2.5/FOO")).toBe(true); // untouched
    });
  });

  describe("no cache (false)", () => {
    it("loads without caching", async () => {
      const store = createProfileStore(baseConfig, false);
      const result = await store.load("2.5", "FOO");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("has() always returns false", async () => {
      const store = createProfileStore(baseConfig, false);
      await store.load("2.5", "FOO");
      expect(store.has("2.5", "FOO")).toBe(false);
    });

    it("evict/reset are safe no-ops", () => {
      const store = createProfileStore(baseConfig, false);
      expect(() => store.evict("2.5", "FOO")).not.toThrow();
      expect(() => store.reset()).not.toThrow();
    });
  });

  describe("error eviction", () => {
    it("evicts rejected promises from cache", async () => {
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: {
          "v2.5/FAIL": () => Promise.reject(new Error("boom")),
        },
        namespace: "test",
      };
      const store = createProfileStore(config, createLruCache());

      await expect(store.load("2.5", "FAIL")).rejects.toThrow("boom");

      await vi.waitFor(() => {
        expect(store.has("2.5", "FAIL")).toBe(false);
      });
    });
  });
});
