import type { ProfileStoreConfig } from "../src/store";
import { createProfileStore } from "../src/store";

const testProfiles: Record<string, { value: string }> = {
  "v2.5/BAR": { value: "bar-raw" },
  "v2.5/FOO": { value: "foo-raw" },
  "v2.6/FOO": { value: "foo-v26-raw" },
};

const testManifest: Record<string, () => Promise<{ value: string }>> =
  Object.fromEntries(
    Object.entries(testProfiles).map(([key, profile]) => [
      key,
      () => Promise.resolve(profile),
    ])
  );

const baseConfig: ProfileStoreConfig<{ value: string }> = {
  manifest: testManifest,
  namespace: "test",
};

describe("createProfileStore", () => {
  describe("load", () => {
    it("loads a profile", async () => {
      const store = createProfileStore(baseConfig);
      const result = await store.load("2.5", "FOO");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("throws for unknown profile", async () => {
      const store = createProfileStore(baseConfig);
      await expect(store.load("2.5", "UNKNOWN")).rejects.toThrow(
        "Unknown test profile: v2.5/UNKNOWN"
      );
    });

    it("resolves the same value for repeated loads", async () => {
      const store = createProfileStore(baseConfig);
      const a = await store.load("2.5", "FOO");
      const b = await store.load("2.5", "FOO");
      expect(a).toBe(b);
    });

    it("does not keep a failed import: the next load imports again", async () => {
      let attempts = 0;
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: {
          "v2.5/FOO": () => {
            attempts += 1;
            return attempts === 1
              ? Promise.reject(new Error("chunk failed to load"))
              : Promise.resolve({ value: "loaded" });
          },
        },
        namespace: "test",
      };
      const store = createProfileStore(config);

      await expect(store.load("2.5", "FOO")).rejects.toThrow(
        "chunk failed to load"
      );
      await expect(store.load("2.5", "FOO")).resolves.toEqual({
        value: "loaded",
      });
    });
  });

  describe("compile", () => {
    it("compiles each raw profile once, even for concurrent loads", async () => {
      const compile = vi.fn((raw: { value: string }) =>
        raw.value.toUpperCase()
      );
      const store = createProfileStore({
        compile,
        manifest: testManifest,
        namespace: "test",
      });

      const [first, second] = await Promise.all([
        store.load("2.5", "FOO"),
        store.load("2.5", "FOO"),
      ]);
      const third = await store.load("2.5", "FOO");

      expect([first, second, third]).toEqual(["FOO-RAW", "FOO-RAW", "FOO-RAW"]);
      expect(compile).toHaveBeenCalledOnce();
    });

    it("applies compile transform to raw data", async () => {
      const config: ProfileStoreConfig<{ value: string }, string> = {
        compile: (raw) => raw.value.toUpperCase(),
        manifest: testManifest,
        namespace: "test",
      };
      const store = createProfileStore(config);
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
      const store = createProfileStore(config);
      const result = await store.load("2.5", "ALIAS");
      expect(result).toEqual({ value: "foo-raw" });
    });

    it("passes through when resolveId returns undefined", async () => {
      const config: ProfileStoreConfig<{ value: string }> = {
        manifest: testManifest,
        namespace: "test",
        resolveId: (_version, _id) => undefined as string | undefined,
      };
      const store = createProfileStore(config);
      const result = await store.load("2.5", "FOO");
      expect(result).toEqual({ value: "foo-raw" });
    });
  });
});
