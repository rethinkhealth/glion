// oxlint-disable promise/prefer-await-to-then

import { createLruCache } from "../src/cache/lru";
import type { ProfileStoreConfig } from "../src/store";
import { createProfileStore } from "../src/store";

const testProfiles: Record<string, { value: string }> = {
  "v2.5/BAR": { value: "bar-raw" },
  "v2.5/FOO": { value: "foo-raw" },
  "v2.6/FOO": { value: "foo-v26-raw" },
};

const importTestProfile = (version: string, id: string) =>
  Promise.resolve(testProfiles[`v${version}/${id}`]);

const baseConfig: ProfileStoreConfig<{ value: string }> = {
  importProfile: importTestProfile,
  namespace: "test",
};

describe("createProfileStore", () => {
  describe("load", () => {
    it("loads a profile", async () => {
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

    it("imports a profile only once per key", async () => {
      const importProfile = vi.fn(() => Promise.resolve({ value: "spied" }));
      const config: ProfileStoreConfig<{ value: string }> = {
        importProfile,
        namespace: "test",
      };
      const store = createProfileStore(config, createLruCache());

      await store.load("2.5", "SPY");
      await store.load("2.5", "SPY");
      expect(importProfile).toHaveBeenCalledOnce();
    });
  });

  describe("compile", () => {
    it("applies compile transform to raw data", async () => {
      const config: ProfileStoreConfig<{ value: string }, string> = {
        compile: (raw) => raw.value.toUpperCase(),
        importProfile: importTestProfile,
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
        importProfile: importTestProfile,
        namespace: "test",
        resolveId: (_version, id) => (id === "ALIAS" ? "FOO" : undefined),
      };
      const store = createProfileStore(config, createLruCache());
      const result = await store.load("2.5", "ALIAS");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("passes through when resolveId returns undefined", async () => {
      const config: ProfileStoreConfig<{ value: string }> = {
        importProfile: importTestProfile,
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
        importProfile: () => Promise.reject(new Error("boom")),
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
