import { describe, expect, it } from "vitest";

import { releaseNotes } from "../src/notes.mjs";

describe("releaseNotes", () => {
  it("lists each entry under its bump with the package it changed", () => {
    const packages = [
      {
        changelog: `# @glion/parser

## 0.2.0

### Minor Changes

- abc1234: Parse segment groups.

### Patch Changes

- def5678: Keep trailing delimiters.
`,
        name: "@glion/parser",
      },
      {
        changelog: `# @glion/ast

## 0.2.0

No changes in this release.
`,
        name: "@glion/ast",
      },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Minor Changes

- abc1234: Parse segment groups.

  Packages: \`@glion/parser\`

## Patch Changes

- def5678: Keep trailing delimiters.

  Packages: \`@glion/parser\`
`);
  });

  it("reads only the section for the released version", () => {
    const packages = [
      {
        changelog: `# @glion/parser

## 0.3.0

### Patch Changes

- 3333333: Newer change.

## 0.2.0

### Patch Changes

- 2222222: Released change.

## 0.1.0

### Patch Changes

- 1111111: Older change.
`,
        name: "@glion/parser",
      },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Patch Changes

- 2222222: Released change.

  Packages: all packages
`);
  });

  it("keeps an entry's paragraphs and nested list", () => {
    const packages = [
      {
        changelog: `## 0.2.0

### Minor Changes

- abc1234: Add TLS.
  - \`tls: true\` verifies the receiver.

  **Breaking:** \`host\` is required.

### Patch Changes

- Updated dependencies [abc1234]:
  - @glion/ast@0.2.0
`,
        name: "@glion/mllp-client",
      },
      { changelog: "## 0.2.0\n", name: "@glion/ast" },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Minor Changes

- abc1234: Add TLS.
  - \`tls: true\` verifies the receiver.

  **Breaking:** \`host\` is required.

  Packages: \`@glion/mllp-client\`
`);
  });

  it("lists an entry several packages share once, with every package it changed", () => {
    const entry = "### Patch Changes\n\n- abc1234: Declare the license.\n";
    const packages = [
      { changelog: `## 0.2.0\n\n${entry}`, name: "@glion/ack" },
      { changelog: `## 0.2.0\n\n${entry}`, name: "@glion/mllp" },
      { changelog: "## 0.2.0\n", name: "@glion/ast" },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Patch Changes

- abc1234: Declare the license.

  Packages: \`@glion/ack\`, \`@glion/mllp\`
`);
  });

  it("says all packages when an entry changed every package released at the version", () => {
    const entry = "### Minor Changes\n\n- abc1234: Require Node 22.\n";
    const packages = [
      { changelog: `## 0.2.0\n\n${entry}`, name: "@glion/ack" },
      { changelog: `## 0.2.0\n\n${entry}`, name: "@glion/ast" },
      { changelog: "", name: "@glion/util-uid" },
      { changelog: `## 0.3.0\n\n${entry}`, name: "@glion/util-charset" },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Minor Changes

- abc1234: Require Node 22.

  Packages: all packages
`);
  });

  it("files a shared entry under the highest bump any package gives it", () => {
    const packages = [
      {
        changelog: "## 0.2.0\n\n### Patch Changes\n\n- abc1234: Rename.\n",
        name: "@glion/ack",
      },
      {
        changelog: "## 0.2.0\n\n### Major Changes\n\n- abc1234: Rename.\n",
        name: "@glion/mllp",
      },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(`## Major Changes

- abc1234: Rename.

  Packages: all packages
`);
  });

  it("omits dependency-only entries in both forms Changesets writes", () => {
    const packages = [
      {
        changelog: `## 0.2.0

### Patch Changes

- Updated dependencies [abc1234]:
  - @glion/ast@0.2.0
- @glion/utils@0.2.0
`,
        name: "@glion/parser",
      },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(
      "No changes in this release.\n"
    );
  });

  it("says no changes when no package has a section for the version", () => {
    const packages = [
      {
        changelog: "## 0.1.0\n\n### Patch Changes\n\n- abc1234: Fix.\n",
        name: "@glion/parser",
      },
    ];

    expect(releaseNotes(packages, "0.2.0")).toBe(
      "No changes in this release.\n"
    );
  });
});
