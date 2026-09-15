import { defineConfig } from "vitest/config";

/**
 * Integration tests: the runtime adapters over real loopback sockets, against
 * the remote systems `tests/integration/setup.ts` starts. Not merged with the
 * base config: merging concatenates `include`, which would add the unit tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    globalSetup: ["./tests/integration/setup.ts"],
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    name: "hl7v2-mllp-client (integration)",
  },
});
