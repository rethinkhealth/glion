import { strykerConfig } from "@glion/testing/stryker";

// The parsers' grammar is in module-level regexes, which only static mutants
// change. Each static mutant runs the whole suite, about a second here.
export default { ...strykerConfig({ break: 95 }), ignoreStatic: false };
