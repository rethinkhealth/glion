#!/usr/bin/env node
import { run } from "./run";

process.exit(await run(process.argv.slice(2)));
