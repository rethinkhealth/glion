# @glion/config

Configuration schema and loader for `.hl7v2rc.json` and related config files.

## What it does

Discovers and validates HL7v2-specific configuration from `.hl7v2rc.*` files, `hl7v2.config.*`, or a `hl7v2` field in `package.json`. Supports JSON, YAML, JavaScript (ESM/CJS), and TypeScript config formats, returns a typed object with `plugins` and `settings`, and ships a JSON Schema so editors can autocomplete config files. Augments the standard [unified-args](https://github.com/unifiedjs/unified-args) configuration system rather than replacing it — `plugins` is passed through, `settings` is validated here.

## Install

```bash
npm install @glion/config
```

## Use

Create a `.hl7v2rc.json` file in your project:

```json
{
  "$schema": "https://raw.githubusercontent.com/rethinkhealth/glion/main/packages/hl7v2-config/schema.json",
  "plugins": ["preset-lint-recommended"],
  "settings": {
    "delimiters": {
      "field": "|",
      "component": "^",
      "subcomponent": "&",
      "repetition": "~",
      "escape": "\\"
    }
  }
}
```

Then load the configuration:

```typescript
import { loadConfig } from "@glion/config";

const { settings } = loadConfig();
console.log(settings.delimiters.field); // "|"
```

## API

### `loadConfig(searchFrom?)`

Loads and validates HL7v2 configuration synchronously. Recommended for CLI tools and startup code.

```typescript
import { loadConfig } from "@glion/config";

// Load full config
const config = loadConfig();

// Load from a specific directory
const config2 = loadConfig("/path/to/project");

// Destructure to get only settings
const { settings } = loadConfig();
```

- Parameters: `searchFrom` (optional) — Directory to start searching from (defaults to cwd).
- Returns: `HL7v2Config` — object containing `plugins` and `settings`.
- Throws: `ConfigurationError` if configuration is invalid.

### `loadConfigAsync(searchFrom?)`

Loads and validates HL7v2 configuration asynchronously. Use when you need non-blocking I/O or are in an async context.

```typescript
import { loadConfigAsync } from "@glion/config";

const config = await loadConfigAsync();
const { settings } = await loadConfigAsync();
```

- Parameters: `searchFrom` (optional) — Directory to start searching from (defaults to cwd).
- Returns: `Promise<HL7v2Config>`.
- Throws: `ConfigurationError` if configuration is invalid.

### `defineConfig(config)`

Type-safe helper for authoring configuration files. Provides IDE autocomplete with no runtime overhead (identity function for type inference).

```typescript
// hl7v2.config.ts
import { defineConfig } from "@glion/config";

export default defineConfig({
  plugins: ["preset-lint-recommended"],
  settings: {
    delimiters: { field: "|", component: "^" },
  },
});
```

### `ConfigurationError`

Error thrown when configuration validation fails.

```typescript
class ConfigurationError extends Error {
  cause?: unknown;
}
```

### `HL7v2Settings`

```typescript
type HL7v2Settings = {
  delimiters?: {
    field?: string; // default: "|"
    component?: string; // default: "^"
    subcomponent?: string; // default: "&"
    repetition?: string; // default: "~"
    escape?: string; // default: "\\"
    segment?: string; // default: "\r"
  };
};
```

## Configuration keys

### `settings.delimiters`

Configure custom delimiters for HL7v2 message parsing. Each delimiter must be exactly one character.

| Key            | Default | Description            |
| -------------- | ------- | ---------------------- |
| `field`        | `\|`    | Field separator        |
| `component`    | `^`     | Component separator    |
| `subcomponent` | `&`     | Subcomponent separator |
| `repetition`   | `~`     | Repetition separator   |
| `escape`       | `\\`    | Escape character       |
| `segment`      | `\r`    | Segment terminator     |

Example — using custom delimiters for a non-standard system:

```json
{
  "settings": {
    "delimiters": {
      "field": "#",
      "component": "@"
    }
  }
}
```

### `plugins`

Handled by unified-args; follows the standard unified plugin configuration format:

```json
{
  "plugins": [
    "plugin-name",
    ["plugin-name", { "option": "value" }],
    ["plugin-name", ["error", { "option": "value" }]]
  ]
}
```

Severity levels:

| Value                   | Description       |
| ----------------------- | ----------------- |
| `"off"` or `0`          | Disable the rule  |
| `"on"` / `"warn"` / `1` | Enable as warning |
| `"error"` or `2`        | Enable as error   |

### Configuration file locations

The loader searches for configuration in the following locations, in order:

| Location                                                    | Format              |
| ----------------------------------------------------------- | ------------------- |
| `package.json`                                              | Under `hl7v2` field |
| `.hl7v2rc`                                                  | JSON                |
| `.hl7v2rc.json`                                             | JSON                |
| `.hl7v2rc.yaml` / `.hl7v2rc.yml`                            | YAML                |
| `.hl7v2rc.js` / `.hl7v2rc.cjs` / `.hl7v2rc.mjs`             | JavaScript          |
| `hl7v2.config.js` / `hl7v2.config.cjs` / `hl7v2.config.mjs` | JavaScript          |

## Examples

### JSON configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/rethinkhealth/glion/main/packages/hl7v2-config/schema.json",
  "plugins": [
    "preset-lint-recommended",
    ["lint-max-message-size", ["error", { "maxBytes": 5000000 }]]
  ],
  "settings": {
    "delimiters": { "field": "|" }
  }
}
```

### TypeScript configuration

```typescript
// hl7v2.config.ts
import { defineConfig } from "@glion/config";

export default defineConfig({
  plugins: ["preset-lint-recommended"],
  settings: {
    delimiters: { field: "|", component: "^" },
  },
});
```

### JavaScript configuration

```javascript
// hl7v2.config.js
export default {
  plugins: [
    "preset-lint-recommended",
    [
      "lint-max-message-size",
      ["error", { maxBytes: parseInt(process.env.MAX_SIZE || "10000000") }],
    ],
  ],
  settings: {
    delimiters: {
      segment: process.env.HL7_SEGMENT_TERMINATOR || "\r",
    },
  },
};
```

### Package.json configuration

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "hl7v2": {
    "plugins": ["preset-lint-recommended"],
    "settings": {
      "delimiters": { "field": "|" }
    }
  }
}
```

### Parser integration

The parser reads settings from the unified processor:

```typescript
import { unified } from "unified";
import { parseHL7v2 } from "@glion/hl7v2";

const processor = unified()
  .use(parseHL7v2)
  .data("settings", {
    delimiters: { field: "|", component: "^" },
  });

const tree = processor.parse("MSH|^~\\&|...");
```

When using the CLI, settings are loaded from configuration files automatically.

### IDE support

For autocomplete and validation, add the `$schema` field to your JSON configuration:

```json
{
  "$schema": "https://raw.githubusercontent.com/rethinkhealth/glion/main/packages/hl7v2-config/schema.json"
}
```

This package only validates configuration and does not execute arbitrary code from config files, except JS/MJS/TS config files which are explicitly imported. Ensure you trust the source of your configuration files.

## Part of Glion

`@glion/config` is part of **[Glion]**, the application framework for HL7v2. See the [Glion README] for the full package catalog and architecture.

[Glion]: https://github.com/rethinkhealth/glion#readme
[Glion README]: https://github.com/rethinkhealth/glion#readme
