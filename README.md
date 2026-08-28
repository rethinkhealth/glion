<div align="center">
  <a href="https://glion.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://glion.dev/images/brand/glion-symbol-light@1x.png">
      <img alt="glion logo" src="https://glion.dev/images/brand/glion-symbol-dark@1x.png" height="128">
    </picture>
  </a>
  <h1 style="border-bottom: 0px">glion</h1>

<a href="https://github.com/rethinkhealth/glion/blob/main/LICENSE"><img alt="GitHub License" src="https://img.shields.io/github/license/rethinkhealth/glion?style=for-the-badge"></a>
<a href="https://www.npmjs.com/package/@glion/cli"><img alt="NPM Version" src="https://img.shields.io/npm/v/%40glion%2Fcli?style=for-the-badge"></a>
<img alt="GitHub Actions Workflow Status" src="https://img.shields.io/github/actions/workflow/status/rethinkhealth/glion/.github%2Fworkflows%2Fci.yml?style=for-the-badge">

</div>

## Getting Started

Glion is an open-source application framework for building HL7v2 integrations. It includes a structured parser, a plugin ecosystem for validation and transformation, and a production-ready MLLP server.

### Features

- 🚀 **Zero-config CLI.** `glion dev` runs your app with live reload during development. `glion start` runs it in production with graceful shutdown and structured logs. `glion send` fires an HL7v2 message over MLLP and prints the ACK.
- 🌍 **MLLP server.** A standards-compliant HL7v2 server with pattern-based routing (`ADT^A01`, `ADT^*`, wildcards), middleware composition, and first-class ACK/NAK responses. Streaming TCP with back-pressure. Runs on Node, Bun, and Deno.
- 🧰 **Parser and plugin ecosystem.** A [`unified`][github-unified]-based parser that produces typed ASTs with lossless round-tripping, plus 25+ plugins for annotation, linting, encoding, and transformation.
- ⛑️ **Profile validation.** Validate against HL7-published profiles for fields, data types, table values, and segment order — automatically selected by the version in `MSH-12`.

## Quick start

Install Glion and its runtime packages:

```bash
npm install @glion/mllp @glion/hl7v2 @glion/cli
```

Define your app in a single file:

```ts
// glion.app.ts
import { parseHL7v2 } from "@glion/hl7v2";
import { Mllp } from "@glion/mllp";

export default new Mllp().parser(parseHL7v2).on("ADT^A01", (ctx) => {
  // Handle admit. Reply by returning a Response ({ raw: string }).
  // Built-in ACK/NAK generation is landing in @glion/mllp — see ADR 0019.
});
```

Run `npm dev` to start the app with live reload during development. Run `npm start` to run it in production with graceful shutdown and structured logs.

See [`examples/`](./examples) for zero-config, explicit-config, and low-level transport examples.

## Packages

Glion is split into two cooperating layers. Use them together, or pick the parts you need.

### Runtime

The server and tooling that run Glion applications.

#### Server & transport

- **[@glion/mllp][glion-mllp]** — a transport-agnostic MLLP (Minimal Lower Layer Protocol) engine with pattern-based routing, middleware, and `unified` processor integration.
- **[@glion/mllp-client][glion-mllp-client]** — a persistent, single-flight MLLP client: sends HL7v2 messages over one long-lived connection and resolves each with its correlated ACK.
- **[@glion/mllp-codec][glion-mllp-codec]** — the MLLP frame/unframe pair: `frame()` envelopes outbound bytes and `unframe()` is a stream transform that reassembles inbound frames across reads.
- **[@glion/cli][glion-cli]** — the `glion` command for running Glion applications: `glion dev` for live reload during development, `glion start` for production with graceful shutdown and structured logs, and `glion send` for sending an HL7v2 message over MLLP and printing the ACK.

#### Acknowledgments

- **[@glion/ack][glion-ack]** — typed HL7v2 acknowledgment codes and exceptions (Tables 0008/0357/0516); server-side response construction is moving into `@glion/mllp` (ADR 0019).

### Unified

The parser, plugins, and utilities that process HL7v2 messages as structured data.

#### Core

- **[@glion/hl7v2][glion-hl7v2]** — the main content pipeline with sensible defaults for parsing, annotating, linting, and serializing HL7v2 messages.
- **[@glion/parser][glion-parser]** — a `unified`-compatible parser that converts HL7v2 text into a structured AST with delimiter detection and position tracking.
- **[@glion/ast][glion-ast]** — TypeScript types for the HL7v2 AST, implementing the `unist` specification.
- **[@glion/builder][glion-builder]** — programmatic construction of HL7v2 AST nodes, useful for tests, fixtures, and synthetic messages.
- **[@glion/to-hl7v2][glion-to-hl7v2]** — serialize AST nodes back to HL7v2 message text, preserving delimiters.
- **[@glion/jsonify][glion-jsonify]** — serialize HL7v2 ASTs to a simplified JSON representation.

#### Plugins

Composable plugins that annotate, enrich, and transform the AST.

- **[@glion/annotate-delimiters][glion-annotate-delimiters]** — annotate `file.data` with the HL7v2 delimiters derived from `MSH-1` and `MSH-2`.
- **[@glion/annotate-profile-context][glion-annotate-profile-context]** — load and attach HL7v2 profile context to `file.data` for downstream plugins.
- **[@glion/annotate-profile-segments][glion-annotate-profile-segments]** — annotate segment nodes with profile metadata.
- **[@glion/annotate-profile-fields][glion-annotate-profile-fields]** — annotate field nodes with profile metadata.
- **[@glion/annotate-profile-datatypes][glion-annotate-profile-datatypes]** — annotate field repetitions, components, and subcomponents with datatype profile metadata.
- **[@glion/annotate-profile-fields-code-systems][glion-annotate-profile-fields-code-systems]** — annotate field-level coded values with UTG code system metadata.
- **[@glion/decode-escapes][glion-decode-escapes]** — decode HL7v2 escape sequences (`\F\`, `\S\`, `\T\`, `\Xdd\`, `\.br\`) into their literal values.
- **[@glion/encode-escapes][glion-encode-escapes]** — encode delimiter characters in subcomponent values as HL7v2 escape sequences before serialization.

#### Linting

Linting rules and presets for HL7v2 message quality and conformance.

##### Presets

- **[@glion/preset-lint-recommended][glion-preset-lint-recommended]** — bundles all core HL7v2 lint rules for a comprehensive baseline.
- **[@glion/preset-lint-profile-recommended][glion-preset-lint-profile-recommended]** — bundles all profile-based lint rules that validate messages against HL7v2 version-specific profiles.
- **[@glion/preset-annotate-profile-recommended][glion-preset-annotate-profile-recommended]** — bundles all profile annotation plugins for a complete enrichment pipeline.

##### Core rules

- **[@glion/lint-required-message-header][glion-lint-required-message-header]** — ensure every message includes a required header segment such as `MSH`.
- **[@glion/lint-max-message-size][glion-lint-max-message-size]** — report when a message exceeds a configurable maximum size in bytes or segment count.
- **[@glion/lint-no-trailing-empty-field][glion-lint-no-trailing-empty-field]** — flag empty fields at the end of a segment, which can cause ambiguity or interoperability issues.
- **[@glion/lint-segment-header-length][glion-lint-segment-header-length]** — validate that segment headers are exactly three characters, as required by the HL7v2 specification.
- **[@glion/lint-message-version][glion-lint-message-version]** — warn when a message version is unsupported or outside expected constraints.

##### Profile rules

- **[@glion/lint-profile-required-fields][glion-lint-profile-required-fields]** — validate that required fields per the HL7v2 profile are present and non-empty.
- **[@glion/lint-profile-required-components][glion-lint-profile-required-components]** — validate that required components within composite data types are present.
- **[@glion/lint-profile-field-max-length][glion-lint-profile-field-max-length]** — enforce field value maximum lengths defined in the HL7v2 profile.
- **[@glion/lint-profile-field-repetition][glion-lint-profile-field-repetition]** — flag non-repeatable fields that contain multiple repetitions.
- **[@glion/lint-profile-table-values][glion-lint-profile-table-values]** — validate coded values against HL7v2 table definitions (UTG).
- **[@glion/lint-profile-events-segments-order][glion-lint-profile-events-segments-order]** — validate segment ordering per the message structure definition.
- **[@glion/lint-profile-extra-fields][glion-lint-profile-extra-fields]** — flag segments that contain fields beyond the maximum sequence defined in the profile.
- **[@glion/lint-profile-extra-components][glion-lint-profile-extra-components]** — flag composite fields that contain more components than the datatype profile defines.

#### Utilities

- **[@glion/utils][glion-utils]** — shared helpers for delimiter detection, normalization, and other HL7v2-specific operations.
- **[@glion/util-visit][glion-util-visit]** — a visitor pattern for traversing HL7v2 ASTs with full path context, metadata extraction, and control flow actions.
- **[@glion/util-query][glion-util-query]** — canonical path querying with syntax like `MSH-9.3` or `ORDER-ORC-1` for `select`, `selectAll`, `value`, `set`, and `matches`.
- **[@glion/util-charset][glion-util-charset]** — encode and decode HL7v2 wire bytes as UTF-8 (fatal — a non-UTF-8 feed fails loudly instead of being silently corrupted).
- **[@glion/util-semver][glion-util-semver]** — tiny, fast HL7v2 version and range comparators.
- **[@glion/util-timestamp][glion-util-timestamp]** — HL7v2 timestamp parsing, formatting, and conversion with precision tracking.
- **[@glion/util-uid][glion-util-uid]** — time-ordered unique IDs for HL7v2 identifier fields, e.g. MSH-10 control IDs (the ULID idea resized to a 20-character default).
- **[@glion/profiles][glion-profiles]** — HL7v2 version-specific profile definitions (fields, data types, tables, segments) with LRU-cached loading, used by the profile-based lint rules.
- **[@glion/config][glion-config]** — configuration schema and loader for HL7v2 processing (`.hl7v2rc.json`).

## Documentation

- Full documentation at [glion.dev](https://glion.dev).
- Runnable examples in [`examples/`](./examples) covering the server (Node and Bun), the `glion` CLI workflow, and sending test messages with `glion send`.
- API reference and detailed usage in each package's README, linked from the Packages section above.

## Status

Glion is pre-1.0. APIs in published packages are stabilizing but may still change in minor releases. We recommend pinning exact versions in production applications.

_Packages were previously published under `@rethinkhealth/hl7v2-*` and were renamed to `@glion/*`. The unscoped `glion` command is published as `@glion/cli` pending npm name approval._

### Preview releases

Every pull request and every commit on `main` publishes preview packages to [pkg.pr.new](https://pkg.pr.new). Install an unreleased fix or feature by its commit SHA, without waiting for a Changesets release:

```bash
pnpm add https://pkg.pr.new/@glion/parser@<commit-sha>
```

Replace `@glion/parser` with any published `@glion/*` package. Preview URLs are surfaced as a bot comment on each open PR. See [ADR 0016](./docs/adr/0016-continuous-preview-releases.md) for rationale and scope.

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Code of Conduct

To ensure a welcoming and positive environment, we have a [Code of Conduct](CODE_OF_CONDUCT.md) that all contributors and participants are expected to adhere to.

## License

Copyright 2026 Rethink Health, SUARL. All rights reserved.

This program is licensed to you under the terms of the [MIT License](https://opensource.org/licenses/MIT). This program is distributed WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.

[github-unified]: https://github.com/unifiedjs/unified
[glion-ack]: https://github.com/rethinkhealth/glion/tree/main/packages/ack#readme
[glion-annotate-delimiters]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-delimiters#readme
[glion-annotate-profile-context]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-profile-context#readme
[glion-annotate-profile-datatypes]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-profile-datatypes#readme
[glion-annotate-profile-fields]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-profile-fields#readme
[glion-annotate-profile-fields-code-systems]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-profile-fields-code-systems#readme
[glion-annotate-profile-segments]: https://github.com/rethinkhealth/glion/tree/main/packages/annotate-profile-segments#readme
[glion-ast]: https://github.com/rethinkhealth/glion/tree/main/packages/ast#readme
[glion-builder]: https://github.com/rethinkhealth/glion/tree/main/packages/builder#readme
[glion-cli]: https://github.com/rethinkhealth/glion/tree/main/packages/glion#readme
[glion-config]: https://github.com/rethinkhealth/glion/tree/main/packages/config#readme
[glion-decode-escapes]: https://github.com/rethinkhealth/glion/tree/main/packages/decode-escapes#readme
[glion-encode-escapes]: https://github.com/rethinkhealth/glion/tree/main/packages/encode-escapes#readme
[glion-hl7v2]: https://github.com/rethinkhealth/glion/tree/main/packages/hl7v2#readme
[glion-jsonify]: https://github.com/rethinkhealth/glion/tree/main/packages/jsonify#readme
[glion-lint-max-message-size]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-max-message-size#readme
[glion-lint-message-version]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-message-version#readme
[glion-lint-no-trailing-empty-field]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-no-trailing-empty-field#readme
[glion-lint-profile-events-segments-order]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-events-segments-order#readme
[glion-lint-profile-extra-components]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-extra-components#readme
[glion-lint-profile-extra-fields]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-extra-fields#readme
[glion-lint-profile-field-max-length]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-field-max-length#readme
[glion-lint-profile-field-repetition]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-field-repetition#readme
[glion-lint-profile-required-components]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-required-components#readme
[glion-lint-profile-required-fields]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-required-fields#readme
[glion-lint-profile-table-values]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-profile-table-values#readme
[glion-lint-required-message-header]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-required-message-header#readme
[glion-lint-segment-header-length]: https://github.com/rethinkhealth/glion/tree/main/packages/lint-segment-header-length#readme
[glion-mllp]: https://github.com/rethinkhealth/glion/tree/main/packages/mllp#readme
[glion-mllp-client]: https://github.com/rethinkhealth/glion/tree/main/packages/mllp-client#readme
[glion-mllp-codec]: https://github.com/rethinkhealth/glion/tree/main/packages/mllp-codec#readme
[glion-parser]: https://github.com/rethinkhealth/glion/tree/main/packages/parser#readme
[glion-preset-annotate-profile-recommended]: https://github.com/rethinkhealth/glion/tree/main/packages/preset-annotate-profile-recommended#readme
[glion-preset-lint-profile-recommended]: https://github.com/rethinkhealth/glion/tree/main/packages/preset-lint-profile-recommended#readme
[glion-preset-lint-recommended]: https://github.com/rethinkhealth/glion/tree/main/packages/preset-lint-recommended#readme
[glion-profiles]: https://github.com/rethinkhealth/glion/tree/main/packages/profiles#readme
[glion-to-hl7v2]: https://github.com/rethinkhealth/glion/tree/main/packages/to-hl7v2#readme
[glion-util-charset]: https://github.com/rethinkhealth/glion/tree/main/packages/util-charset#readme
[glion-util-query]: https://github.com/rethinkhealth/glion/tree/main/packages/util-query#readme
[glion-util-semver]: https://github.com/rethinkhealth/glion/tree/main/packages/util-semver#readme
[glion-util-timestamp]: https://github.com/rethinkhealth/glion/tree/main/packages/util-timestamp#readme
[glion-util-uid]: https://github.com/rethinkhealth/glion/tree/main/packages/util-uid#readme
[glion-util-visit]: https://github.com/rethinkhealth/glion/tree/main/packages/util-visit#readme
[glion-utils]: https://github.com/rethinkhealth/glion/tree/main/packages/utils#readme
