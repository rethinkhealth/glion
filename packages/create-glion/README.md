# create-glion

Scaffold a new Glion app from an example in [`rethinkhealth/glion`](https://github.com/rethinkhealth/glion).

## Usage

```bash
# Prompts for a directory, then scaffolds the `starter` example.
pnpm create glion
npm create glion
yarn create glion
bun create glion

# Scaffold into my-app without a prompt.
pnpm create glion my-app

# Scaffold another example.
pnpm create glion my-app --example mllp-server

# Scaffold a template from any public GitHub repository.
pnpm create glion my-app --example https://github.com/acme/hl7-template
pnpm create glion my-app --example https://github.com/acme/templates/tree/main/mllp-tls

# A branch whose name contains a slash: give the directory separately.
pnpm create glion my-app --example https://github.com/acme/templates/tree/feat/tls --example-path mllp-tls
```

## Options

| Flag                               | Description                                                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[dir]` (positional)               | Target directory. Prompts when omitted; defaults to `./my-glion-app`.                                                                                                                                          |
| `-e, --example <name\|github-url>` | The template to scaffold: the name of a directory in [`examples/`](https://github.com/rethinkhealth/glion/tree/main/examples), or the URL of a GitHub repository or a directory in one. Defaults to `starter`. |
| `--example-path <path>`            | The template's directory in the repository, for a URL whose branch name contains a slash.                                                                                                                      |
| `-h, --help`                       | Print usage and exit.                                                                                                                                                                                          |

A template is a directory with a `package.json`. A repository URL with no `/tree/` part means the root of its default branch. The template is checked for a `package.json` before anything is downloaded, then fetched with [`giget`](https://github.com/unjs/giget) and copied unchanged. The examples in this repository come from `main` and depend on the `latest` release of every `@glion/*` package.

Only public GitHub repositories are supported. A template's files, including its install scripts, run on your machine, so scaffold only from repositories you trust.

## License

MIT © Glion contributors
