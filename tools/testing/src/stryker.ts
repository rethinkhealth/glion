import type { PartialStrykerOptions } from "@stryker-mutator/api/core";

export interface StrykerConfigOptions {
  /**
   * Mutation score below which the run fails. Set from the package's measured
   * baseline minus five and only ever raised.
   */
  break: number;
}

/**
 * Shared Stryker configuration for a package that opts into mutation testing.
 *
 * The package must list `@stryker-mutator/core` and
 * `@stryker-mutator/vitest-runner` as devDependencies: Stryker resolves its
 * plugins from the package that runs it, and pnpm exposes nothing else there.
 */
export function strykerConfig(
  options: StrykerConfigOptions
): PartialStrykerOptions {
  return {
    ignoreStatic: true,
    incremental: true,
    incrementalFile: "reports/stryker-incremental.json",
    jsonReporter: { fileName: "reports/stryker.json" },
    plugins: ["@stryker-mutator/vitest-runner"],
    reporters: ["clear-text", "progress", "json"],
    testRunner: "vitest",
    thresholds: { break: options.break, high: 85, low: 70 },
    vitest: { configFile: "vitest.config.ts" },
  };
}
