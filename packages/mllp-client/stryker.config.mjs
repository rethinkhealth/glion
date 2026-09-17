import { strykerConfig } from "@glion/testing/stryker";

export default {
  ...strykerConfig({ break: 78 }),
  // The runtime adapters are proven by the integration layer over real
  // sockets, which cannot run per mutant; the unit run does not reach them.
  mutate: ["src/**/*.ts", "!src/**/*.d.ts", "!src/runtime/**"],
};
