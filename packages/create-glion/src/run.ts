import { existsSync } from "node:fs";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { downloadTemplate } from "giget";

import { EXAMPLES_URL, gigetSource, resolveTemplate } from "./example";
import type { Options } from "./options";
import { parseOptions } from "./options";

const DEFAULT_DIR = "./my-glion-app";
const DEFAULT_EXAMPLE = "starter";

const HELP = `Usage: create-glion [dir] [options]

Options:
  -e, --example <name|github-url>  The example to bootstrap the project with:
                                   the name of a directory in
                                   ${EXAMPLES_URL},
                                   or the URL of a GitHub repository or a
                                   directory in one. Defaults to ${DEFAULT_EXAMPLE}.
  --example-path <path>            The template's directory in the repository,
                                   for a URL whose branch name contains a slash.
  -h, --help                       Show this message
`;

async function askDirectory(): Promise<string | undefined> {
  const answer = await p.text({
    defaultValue: DEFAULT_DIR,
    message: "Where should we create your project?",
    placeholder: DEFAULT_DIR,
  });
  if (p.isCancel(answer)) {
    return undefined;
  }
  return answer.trim() || DEFAULT_DIR;
}

async function mayWriteTo(dir: string): Promise<boolean> {
  if (!existsSync(resolve(dir))) {
    return true;
  }
  const replace = await p.confirm({
    initialValue: false,
    message: `The folder ${dir} already exists. Replace the files in it?`,
  });
  return replace === true;
}

async function scaffold(options: Options): Promise<void> {
  p.intro("Create a Glion app");

  const example = options.example?.trim() || DEFAULT_EXAMPLE;
  const template = await resolveTemplate(example, options.examplePath);
  const dir = options.dir || (await askDirectory());
  if (dir === undefined || !(await mayWriteTo(dir))) {
    p.cancel("Cancelled. Nothing was created.");
    return;
  }

  const spinner = p.spinner();
  spinner.start("Downloading the template");
  await downloadTemplate(gigetSource(template), {
    dir: resolve(dir),
    force: true,
  });
  spinner.stop(`Your project is ready in ${dir}.`);

  const packageManager =
    process.env.npm_config_user_agent?.split("/")[0] || "npm";
  p.note(
    `cd ${dir}\n${packageManager} install\n\nThen open README.md to get started.`,
    "Next steps"
  );
  p.outro("Happy healthcare interface programming!");
}

/**
 * Runs `create-glion` with `args`, the command-line arguments after the
 * program name, and resolves to its exit code.
 *
 * Never rejects: an error is reported to the user and resolves to `1`.
 */
export async function run(args: string[]): Promise<number> {
  try {
    const options = parseOptions(args);
    if (options.help) {
      process.stdout.write(`${HELP}\n`);
      return 0;
    }
    await scaffold(options);
    return 0;
  } catch (error: unknown) {
    p.cancel(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
