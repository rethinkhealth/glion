#!/usr/bin/env node
import { run } from "./run";

process.exitCode = await run(process.argv.slice(2));
