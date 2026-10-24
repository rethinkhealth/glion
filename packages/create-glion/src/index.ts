#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import * as p from "@clack/prompts";
import { downloadTemplate } from "giget";

import { EXAMPLES_URL, gigetSource, resolveTemplate } from "./example";
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

function abort(): never {
  p.cancel("Cancelled. Nothing was created.");
  process.exit(0);
}

async function askDirectory(): Promise<string> {
  const answer = await p.text({
    defaultValue: DEFAULT_DIR,
    message: "Where should we create your project?",
    placeholder: DEFAULT_DIR,
  });
  if (p.isCancel(answer)) {
    abort();
  }
  return answer.trim() || DEFAULT_DIR;
}

async function confirmOverwrite(dir: string): Promise<void> {
  const proceed = await p.confirm({
    initialValue: false,
    message: `The folder ${dir} already exists. Replace the files in it?`,
  });
  if (p.isCancel(proceed) || !proceed) {
    abort();
  }
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  p.intro("Create a Glion app");

  const example = options.example?.trim() || DEFAULT_EXAMPLE;
  const template = await resolveTemplate(example, options.examplePath);
  const dir = options.dir || (await askDirectory());
  const target = resolve(dir);
  if (existsSync(target)) {
    await confirmOverwrite(dir);
  }

  const spinner = p.spinner();
  spinner.start("Downloading the template");
  await downloadTemplate(gigetSource(template), { dir: target, force: true });
  spinner.stop(`Your project is ready in ${dir}.`);

  const packageManager =
    process.env.npm_config_user_agent?.split("/")[0] || "npm";
  p.note(
    `cd ${dir}\n${packageManager} install\n\nThen open README.md to get started.`,
    "Next steps"
  );
  p.outro("Happy healthcare interface programming!");
}

try {
  await run();
} catch (error: unknown) {
  p.cancel(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
