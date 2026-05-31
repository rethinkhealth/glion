# create-glion

Scaffold a new Glion app from an example in [`rethinkhealth/glion`](https://github.com/rethinkhealth/glion).

## Usage

```bash
# Default: prompts for a directory only, then scaffolds the `starter` template.
pnpm create glion
npm create glion
yarn create glion
bun create glion

# Skip every prompt — directory and starter template are both fixed.
pnpm create glion my-app

# Pick a non-default template up front.
pnpm create glion my-app --example mllp-server

# Open the interactive template picker (pass --example with no value).
pnpm create glion my-app --example
```

## Options

| Flag                     | Description                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[dir]` (positional)     | Target directory. Prompts when omitted; defaults to `./my-glion-app`.                                                                                    |
| `-e, --example [<name>]` | Example to clone from `examples/`. Pass a name to use it directly, or pass the flag with no value to open the interactive picker. Omit to use `starter`. |
| `-h, --help`             | Print usage and exit.                                                                                                                                    |

## Examples

| Name              | Description                                                      |
| ----------------- | ---------------------------------------------------------------- |
| `starter`         | Starter Glion — minimal HL7v2 MLLP server. The default scaffold. |
| `mllp-server`     | HL7v2 MLLP server with route handlers (Node.js).                 |
| `mllp-server-bun` | HL7v2 MLLP server with route handlers (Bun).                     |

Each example is fetched from `github:rethinkhealth/glion/examples/<name>` via [`giget`](https://github.com/unjs/giget).

## License

MIT © Glion contributors
