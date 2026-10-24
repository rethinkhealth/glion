import { parseArgs } from "node:util";

/** The command line of `create-glion`. */
export interface Options {
  /** The directory to scaffold into, or `undefined` when not given. */
  dir: string | undefined;
  /** The `--example` value: an example name or a GitHub URL. */
  example: string | undefined;
  /** The `--example-path` value: the template's directory in the repository. */
  examplePath: string | undefined;
  help: boolean;
}

/**
 * Reads the command line of `create-glion`.
 *
 * @param args - The arguments after the program name.
 * @throws {TypeError} When an option is unknown or has no value.
 */
export function parseOptions(args: string[]): Options {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args,
    options: {
      example: { short: "e", type: "string" },
      "example-path": { type: "string" },
      help: { short: "h", type: "boolean" },
    },
  });
  return {
    dir: positionals[0],
    example: values.example,
    examplePath: values["example-path"],
    help: values.help ?? false,
  };
}
