import { describe, expect, it } from "vitest";

import { checkRelease } from "../src/check.mjs";

interface Packument {
  "dist-tags": { latest: string };
  versions: Record<
    string,
    {
      deprecated?: string;
      dist?: { attestations?: { provenance?: object } };
    }
  >;
}

const PROVENANCE = { predicateType: "https://slsa.dev/provenance/v1" };

const packument = (versions: Packument["versions"]): Packument => ({
  "dist-tags": { latest: Object.keys(versions).at(-1) ?? "" },
  versions,
});

const released = (...versions: string[]): Packument =>
  packument(
    Object.fromEntries(
      versions.map((version) => [
        version,
        { dist: { attestations: { provenance: PROVENANCE } } },
      ])
    )
  );

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

    await expect(
      checkRelease(packages, ["@glion/ack", "@glion/parser"], fetchPackument)
    ).resolves.toEqual([]);
  });

  it("reports a package the registry does not have", async () => {
    const packages = [{ name: "@glion/mllp-codec", version: "0.18.0" }];

    await expect(checkRelease(packages, [], registry({}))).resolves.toEqual([
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

    await expect(checkRelease(packages, [], fetchPackument)).resolves.toEqual([
      { name: "@glion/ack", status: "missing-version", version: "0.18.0" },
    ]);
  });

  it("reports a published version without a provenance attestation", async () => {
    const packages = [{ name: "@glion/util-uid", version: "0.18.0" }];
    const fetchPackument = registry({
      "@glion/util-uid": packument({
        "0.18.0": { dist: { attestations: undefined } },
      }),
    });

    await expect(checkRelease(packages, [], fetchPackument)).resolves.toEqual([
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
      "@glion/util-uid": packument({ "0.18.0": {} }),
    });

    await expect(
      checkRelease(packages, [], fetchPackument)
    ).resolves.toMatchObject([{ status: "missing-provenance" }]);
  });

  it("reports a public package whose workspace version is deprecated", async () => {
    const packages = [{ name: "@glion/mllp-codec", version: "0.30.0" }];
    const fetchPackument = registry({
      "@glion/mllp-codec": packument({
        "0.30.0": {
          deprecated: "Renamed to @glion/mllp-codec.",
          dist: { attestations: { provenance: PROVENANCE } },
        },
      }),
    });

    await expect(
      checkRelease(packages, ["@glion/mllp-codec"], fetchPackument)
    ).resolves.toEqual([
      { name: "@glion/mllp-codec", status: "deprecated", version: "0.30.0" },
    ]);
  });

  it("does not check private packages against their workspace version", async () => {
    const packages = [
      { name: "@glion/testing", private: true, version: "0.18.0" },
      { name: "glion-workspace", private: true, version: "0.0.0" },
    ];
    const queried: string[] = [];
    const fetchPackument = (name: string) => {
      queried.push(name);
      return Promise.resolve(null);
    };

    await expect(checkRelease(packages, [], fetchPackument)).resolves.toEqual(
      []
    );
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
      "@glion/util-uid": packument({ "0.19.0": {} }),
    });

    await expect(checkRelease(packages, [], fetchPackument)).resolves.toEqual([
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

  it("reports a scope package that is not a public workspace package and has a version that is not deprecated", async () => {
    const fetchPackument = registry({
      "@glion/mllp-transport": packument({
        "0.15.0": {},
        "0.16.0": { deprecated: "Renamed to @glion/mllp-codec." },
      }),
    });

    await expect(
      checkRelease([], ["@glion/mllp-transport"], fetchPackument)
    ).resolves.toEqual([
      {
        name: "@glion/mllp-transport",
        status: "not-deprecated",
        version: "0.16.0",
      },
    ]);
  });

  it("reports nothing for a scope package whose every version is deprecated", async () => {
    const fetchPackument = registry({
      "@glion/mllp-transport": packument({
        "0.15.0": { deprecated: "Renamed to @glion/mllp-codec." },
        "0.16.0": { deprecated: "Renamed to @glion/mllp-codec." },
      }),
    });

    await expect(
      checkRelease([], ["@glion/mllp-transport"], fetchPackument)
    ).resolves.toEqual([]);
  });

  it("treats an empty deprecation message as not deprecated", async () => {
    const fetchPackument = registry({
      "@glion/mllp-ack": packument({ "0.16.0": { deprecated: "" } }),
    });

    await expect(
      checkRelease([], ["@glion/mllp-ack"], fetchPackument)
    ).resolves.toMatchObject([{ status: "not-deprecated" }]);
  });

  it("reports a scope package that is private in the workspace and not deprecated", async () => {
    const packages = [
      { name: "@glion/testing", private: true, version: "0.0.0" },
    ];
    const fetchPackument = registry({
      "@glion/testing": packument({ "0.1.0": {} }),
    });

    await expect(
      checkRelease(packages, ["@glion/testing"], fetchPackument)
    ).resolves.toEqual([
      { name: "@glion/testing", status: "not-deprecated", version: "0.1.0" },
    ]);
  });

  it("reports nothing for a scope package with no published version", async () => {
    const fetchPackument = registry({
      "@glion/unpublished": packument({}),
    });

    await expect(
      checkRelease([], ["@glion/gone", "@glion/unpublished"], fetchPackument)
    ).resolves.toEqual([]);
  });

  it("lists scope findings after workspace findings, in name order", async () => {
    const packages = [{ name: "@glion/parser", version: "0.19.0" }];
    const fetchPackument = registry({
      "@glion/mllp-ack": packument({ "0.16.0": {} }),
      "@glion/mllp-transport": packument({ "0.16.0": {} }),
    });

    await expect(
      checkRelease(
        packages,
        ["@glion/mllp-transport", "@glion/parser", "@glion/mllp-ack"],
        fetchPackument
      )
    ).resolves.toEqual([
      { name: "@glion/parser", status: "missing-package", version: "0.19.0" },
      { name: "@glion/mllp-ack", status: "not-deprecated", version: "0.16.0" },
      {
        name: "@glion/mllp-transport",
        status: "not-deprecated",
        version: "0.16.0",
      },
    ]);
  });

  it("rejects when a public package lookup rejects", async () => {
    const packages = [{ name: "@glion/ack", version: "0.19.0" }];
    const fetchPackument = () =>
      Promise.reject(new Error("registry returned 503"));

    await expect(checkRelease(packages, [], fetchPackument)).rejects.toThrow(
      "registry returned 503"
    );
  });

  it("rejects when a scope package lookup rejects", async () => {
    const packages = [{ name: "@glion/ack", version: "0.19.0" }];
    const fetchPackument = (name: string) =>
      name === "@glion/mllp-ack"
        ? Promise.reject(new Error("registry returned 503"))
        : Promise.resolve(released("0.19.0"));

    await expect(
      checkRelease(packages, ["@glion/ack", "@glion/mllp-ack"], fetchPackument)
    ).rejects.toThrow("registry returned 503");
  });
});
