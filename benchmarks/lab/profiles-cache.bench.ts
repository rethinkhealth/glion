/**
 * Lab sweep — profile loading strategies, cold vs warm.
 *
 * Not CodSpeed-tracked: run with `pnpm bench:lab` when touching the
 * profiles cache layer.
 *
 * The module-level warmup below runs before any benchmark, so Node's module
 * cache already holds the profile chunks: the "cold" benches measure the
 * profiles cache layer overhead, not disk I/O.
 */
import { createProfiles } from "@glion/profiles";
import { bench, describe } from "vitest";

const SEGMENTS = [
  "MSH",
  "SFT",
  "EVN",
  "PID",
  "PD1",
  "NK1",
  "NK1",
  "PV1",
  "PV2",
  "DB1",
  "OBX",
  "OBX",
  "OBX",
  "AL1",
  "AL1",
  "DG1",
  "DG1",
  "DG1",
  "DRG",
  "PR1",
  "PR1",
  "GT1",
  "GT1",
  "IN1",
  "IN2",
  "IN1",
  "IN2",
  "ACC",
  "UB1",
  "UB2",
];

// Warmup: populate Node's module cache so the first measured iteration
// doesn't pay one-time dynamic-import cost.
const warmup = createProfiles();
await warmup.events.load("2.5", "ADT_A01");
for (const seg of SEGMENTS) {
  await warmup.fields.load("2.5", seg);
}

describe(`cold start — fresh profiles instance (${SEGMENTS.length} segments)`, () => {
  bench("cached instance", async () => {
    const p = createProfiles();
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }
  });

  bench("no-cache instance", async () => {
    const p = createProfiles({ cache: false });
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }
  });
});

describe("transition: cold first message then warm second", () => {
  bench("with cache", async () => {
    const p = createProfiles();

    // First message — cold
    await p.events.load("2.5", "ADT_A01");
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }

    // Second message — warm
    await p.events.load("2.5", "ADT_A01");
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }
  });

  bench("without cache", async () => {
    const p = createProfiles({ cache: false });

    // First message — cold
    await p.events.load("2.5", "ADT_A01");
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }

    // Second message — warm
    await p.events.load("2.5", "ADT_A01");
    for (const seg of SEGMENTS) {
      await p.fields.load("2.5", seg);
    }
  });
});
