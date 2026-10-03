import { describe, expect, it } from "vitest";

import { runner } from "../src/automata/runner";
import { createProfiles } from "../src/profiles";

const versions = [
  "2.1",
  "2.2",
  "2.3",
  "2.3.1",
  "2.4",
  "2.5",
  "2.5.1",
  "2.6",
  "2.7",
  "2.7.1",
  "2.8",
  "2.8.1",
  "2.8.2",
];
const eventIds = ["PPP_PCB", "PPG_PCG"];

const DETAIL_LEAF = /\/ORDER_DETAIL\/(CHOICE|ORDER_OBSERVATION)$/;

function closes(groupsClosed: readonly string[] | undefined, leaf: string) {
  return Boolean(
    groupsClosed?.some((g) => DETAIL_LEAF.test(g) && g.endsWith(leaf))
  );
}

/**
 * At every ORDER_DETAIL-level state, the ORC transition must close the same
 * single leaf occupant that its same-state sibling transitions close. If any
 * non-ORC sibling closes …/ORDER_DETAIL/CHOICE, the open leaf is CHOICE and ORC
 * must close CHOICE (and not ORDER_OBSERVATION); otherwise the open leaf is
 * ORDER_OBSERVATION (post-observation, or a version without the CHOICE subtree)
 * and ORC must close ORDER_OBSERVATION (and not CHOICE). Iterating all versions
 * × both profiles catches a codegen regression in any one of them.
 */
describe("ORC ORDER_DETAIL close-leaf consistency", () => {
  it("every ORDER_DETAIL-level ORC closes the same leaf its siblings close", async () => {
    const profiles = createProfiles();
    const violations: string[] = [];

    for (const version of versions) {
      for (const eventId of eventIds) {
        let def;
        try {
          def = await profiles.events.load(version, eventId);
        } catch {
          continue;
        }
        const effects = def.effects ?? {};
        for (const key of Object.keys(effects)) {
          const m = /^(\d+):ORC$/.exec(key);
          if (!m) {
            continue;
          }
          const orcCloses = effects[key].groupsClosed;
          if (!orcCloses.some((g) => DETAIL_LEAF.test(g))) {
            continue;
          }
          const state = m[1];
          const orcClosesChoice = closes(orcCloses, "CHOICE");
          const orcClosesObs = closes(orcCloses, "ORDER_OBSERVATION");
          // Any same-state non-ORC sibling closing CHOICE proves CHOICE is the open leaf.
          let sibClosesChoice = false;
          for (const k2 of Object.keys(effects)) {
            const m2 = /^(\d+):(.+)$/.exec(k2);
            if (!m2 || m2[1] !== state || m2[2] === "ORC") {
              continue;
            }
            if (closes(effects[k2].groupsClosed, "CHOICE")) {
              sibClosesChoice = true;
              break;
            }
          }
          if (sibClosesChoice) {
            if (!orcClosesChoice || orcClosesObs) {
              violations.push(
                `${version}/${eventId} state ${state}: ORC should close CHOICE only (closesChoice=${orcClosesChoice}, closesObs=${orcClosesObs})`
              );
            }
          } else if (!orcClosesObs || orcClosesChoice) {
            violations.push(
              `${version}/${eventId} state ${state}: ORC should close ORDER_OBSERVATION only (closesChoice=${orcClosesChoice}, closesObs=${orcClosesObs})`
            );
          }
        }
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});

describe("PPP_PCB v2.3.1 end-to-end runner walk through ORDER_DETAIL", () => {
  const baseWalk = ["MSH", "PID", "PTH", "PRB", "ORC", "OBR", "RXO"];

  async function walk(symbols: string[]) {
    const profiles = createProfiles();
    const def = await profiles.events.load("2.3.1", "PPP_PCB");
    const r = runner(def);
    const steps: Array<{
      key: string;
      closed: readonly string[];
      opened: readonly string[];
    }> = [];
    let state = def.start;
    for (const symbol of symbols) {
      const ev = r.consume(symbol);
      expect(ev.type).toBe("step");
      if (ev.type === "step") {
        steps.push({
          closed: ev.effects?.groupsClosed ?? [],
          key: `${state}:${symbol}`,
          opened: ev.effects?.groupsOpened ?? [],
        });
      }
      const row = def.transitions.get(state);
      const dest = row?.get(symbol) ?? row?.get("Hxx");
      expect(dest).toBeDefined();
      state = dest as number;
    }
    return { r, steps };
  }

  const has = (arr: readonly string[], suffix: string) =>
    arr.some((g) => g.endsWith(suffix));

  it("24:ORC (post-choice) closes CHOICE and re-opens ORDER", async () => {
    const { r, steps } = await walk([...baseWalk, "ORC"]);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(has(byKey["10:OBR"].opened, "/ORDER_DETAIL")).toBe(true);
    expect(has(byKey["10:OBR"].opened, "/ORDER_DETAIL/CHOICE")).toBe(true);
    expect(has(byKey["24:ORC"].closed, "/ORDER_DETAIL/CHOICE")).toBe(true);
    expect(has(byKey["24:ORC"].closed, "/ORDER_DETAIL/ORDER_OBSERVATION")).toBe(
      false
    );
    expect(has(byKey["24:ORC"].opened, "/ORDER")).toBe(true);
    expect(r.accepted).toBe(true);
  });

  it("post-observation 27:ORC still closes ORDER_OBSERVATION (no regression)", async () => {
    const { r, steps } = await walk([...baseWalk, "OBX", "ORC"]);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(has(byKey["24:OBX"].closed, "/ORDER_DETAIL/CHOICE")).toBe(true);
    expect(has(byKey["24:OBX"].opened, "/ORDER_DETAIL/ORDER_OBSERVATION")).toBe(
      true
    );
    expect(has(byKey["27:ORC"].closed, "/ORDER_DETAIL/ORDER_OBSERVATION")).toBe(
      true
    );
    expect(has(byKey["27:ORC"].closed, "/ORDER_DETAIL/CHOICE")).toBe(false);
    expect(r.accepted).toBe(true);
  });
});
