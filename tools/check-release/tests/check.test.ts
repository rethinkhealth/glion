import { describe, expect, it } from "vitest";

import { checkRelease } from "../src/check.mjs";

interface Packument {
  versions: Record<
    string,
    { dist?: { attestations?: { provenance?: object } } }
  >;
}

const PROVENANCE = { predicateType: "https://slsa.dev/provenance/v1" };

const released = (...versions: string[]): Packument => ({
  versions: Object.fromEntries(
    versions.map((version) => [
      version,
      { dist: { attestations: { provenance: PROVENANCE } } },
    ])
  ),
});

const registry = (packuments: Record<string, Packument>) => (name: string) =>
  Promise.resolve(packuments[name] ?? null);

describe("checkRelease", () => {
  it("reports nothing when every public package version is on the registry with provenance", async () => {
    const packages = [
      { name: "@glion/ack", version: "0.19.0" },
      { name: "@glion/parser", version: "0.19.0" },
    ];
    const fetchPackument = registry({
      "@glion/ack": released("0.18.0", "0.19.0"),
      "@glion/parser": released("0.19.0"),
    });

    await expect(checkRelease(packages, fetchPackument)).resolves.toEqual([]);
  });

  it("reports a package the registry does not have", async () => {
    const packages = [{ name: "@glion/mllp-codec", version: "0.18.0" }];

    await expect(checkRelease(packages, registry({}))).resolves.toEqual([
      {
        name: "@glion/mllp-codec",
        status: "missing-package",
        version: "0.18.0",
      },
    ]);
  });

  it("reports a package whose workspace version is not on the registry", async () => {
    const packages = [{ name: "@glion/ack", version: "0.18.0" }];
    const fetchPackument = registry({ "@glion/ack": released("0.16.0") });

    await expect(checkRelease(packages, fetchPackument)).resolves.toEqual([
      { name: "@glion/ack", status: "missing-version", version: "0.18.0" },
    ]);
  });

  it("reports a published version without a provenance attestation", async () => {
    const packages = [{ name: "@glion/util-uid", version: "0.18.0" }];
    const fetchPackument = registry({
      "@glion/util-uid": {
        versions: { "0.18.0": { dist: { attestations: undefined } } },
      },
    });

    await expect(checkRelease(packages, fetchPackument)).resolves.toEqual([
      {
        name: "@glion/util-uid",
        status: "missing-provenance",
        version: "0.18.0",
      },
    ]);
  });

  it("treats a version with no dist block as missing provenance", async () => {
    const packages = [{ name: "@glion/util-uid", version: "0.18.0" }];
    const fetchPackument = registry({
      "@glion/util-uid": { versions: { "0.18.0": {} } },
    });

    await expect(checkRelease(packages, fetchPackument)).resolves.toMatchObject(
      [{ status: "missing-provenance" }]
    );
  });

  it("skips private packages without querying the registry", async () => {
    const packages = [
      { name: "@glion/testing", private: true, version: "0.18.0" },
      { name: "glion-workspace", private: true, version: "0.0.0" },
    ];
    const queried: string[] = [];
    const fetchPackument = (name: string) => {
      queried.push(name);
      return Promise.resolve(null);
    };

    await expect(checkRelease(packages, fetchPackument)).resolves.toEqual([]);
    expect(queried).toEqual([]);
  });

  it("keeps findings in workspace order across mixed outcomes", async () => {
    const packages = [
      { name: "@glion/ack", version: "0.19.0" },
      { name: "@glion/mllp-codec", version: "0.19.0" },
      { name: "@glion/parser", version: "0.19.0" },
      { name: "@glion/util-uid", version: "0.19.0" },
    ];
    const fetchPackument = registry({
      "@glion/ack": released("0.19.0"),
      "@glion/parser": released("0.18.0"),
      "@glion/util-uid": { versions: { "0.19.0": {} } },
    });

    await expect(checkRelease(packages, fetchPackument)).resolves.toEqual([
      {
        name: "@glion/mllp-codec",
        status: "missing-package",
        version: "0.19.0",
      },
      { name: "@glion/parser", status: "missing-version", version: "0.19.0" },
      {
        name: "@glion/util-uid",
        status: "missing-provenance",
        version: "0.19.0",
      },
    ]);
  });

  it("rejects when the registry lookup rejects", async () => {
    const packages = [{ name: "@glion/ack", version: "0.19.0" }];
    const fetchPackument = () =>
      Promise.reject(new Error("registry returned 503"));

    await expect(checkRelease(packages, fetchPackument)).rejects.toThrow(
      "registry returned 503"
    );
  });
});
