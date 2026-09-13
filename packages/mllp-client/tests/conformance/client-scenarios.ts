/**
 * `describeMllpClientScenarios`: the client's behaviour over a real socket
 * as a vitest suite an adapter instantiates with its own runner.
 *
 * @module
 */

import { describe, expect, it } from "vitest";

import type { MllpSocket } from "../../src/index";
import { startReceiver } from "./receiver";
import { runScenario, scenarioIds, scenarios } from "./scenarios";
import type { ScenarioId } from "./scenarios";
import type { RemoteAddress, ScenarioOutcome } from "./types";

/** Executes one scenario wherever the client under test lives. */
export interface ClientScenarioRunner {
  run(id: ScenarioId, address: RemoteAddress): Promise<ScenarioOutcome>;
}

/** A runner that opens the socket in this process. */
export function inProcess(
  open: (address: RemoteAddress) => MllpSocket
): ClientScenarioRunner {
  return { run: (id, address) => runScenario(id, open(address)) };
}

const ownerClosed = ["connect", "disconnect:null", "close"];

const expected: Readonly<
  Record<ScenarioId, (outcome: ScenarioOutcome) => void>
> = {
  "S1-three-sends": (outcome) => {
    expect(outcome.results.map((r) => r.code)).toEqual(["AA", "AA", "AA"]);
    expect(outcome).toMatchObject({
      events: ownerClosed,
      state: "closed",
      stateAfterRun: "connected",
    });
  },
  "S10-close-from-connected": (outcome) => {
    expect(outcome).toMatchObject({
      events: ownerClosed,
      results: [],
      state: "closed",
      stateAfterRun: "connected",
    });
  },
  "S2-split-acknowledgment": (outcome) => {
    expect(outcome.results).toMatchObject([{ code: "AA" }]);
    expect(outcome.events).toEqual(ownerClosed);
  },
  "S3-silent-receiver": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "SEND_TIMEOUT", error: "MllpSendTimeoutError" },
    ]);
    expect(outcome).toMatchObject({
      events: ["connect", "disconnect:SEND_TIMEOUT", "close"],
      stateAfterRun: "closed",
    });
  },
  "S4-dropped-after-read": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "CONNECTION_LOST", error: "MllpConnectionLostError" },
    ]);
    expect(outcome.events).toEqual([
      "connect",
      "disconnect:CONNECTION_LOST",
      "close",
    ]);
  },
  "S5-one-shot-peer": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "AA" },
      { code: "CONNECTION_LOST" },
    ]);
    expect(outcome.stateAfterRun).toBe("closed");
  },
  "S6-refused": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "CONNECT_FAILED", error: "MllpConnectFailedError" },
    ]);
    expect(outcome.events).toEqual(["close"]);
  },
  "S7-blackhole": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "CONNECT_TIMEOUT", error: "MllpConnectTimeoutError" },
    ]);
    expect(outcome.events).toEqual(["close"]);
  },
  "S8-application-reject": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "AE", error: "AckApplicationError" },
      { code: "AA" },
    ]);
    expect(outcome).toMatchObject({
      events: ownerClosed,
      stateAfterRun: "connected",
    });
  },
  "S9-destroy-during-send": (outcome) => {
    expect(outcome.results).toMatchObject([
      { code: "CLOSED", error: "MllpClientClosedError" },
    ]);
    expect(outcome).toMatchObject({
      events: ownerClosed,
      stateAfterRun: "closed",
    });
  },
};

/**
 * Registers one test per scenario, each against its own receiver.
 *
 * `name` labels the suite. Every scenario runs through `runner`.
 */
export function describeMllpClientScenarios(
  name: string,
  runner: ClientScenarioRunner
): void {
  describe(`${name} — MllpClient scenarios`, () => {
    for (const id of scenarioIds) {
      it(id, async () => {
        await using receiver = await startReceiver(scenarios[id].receiver);
        expected[id](await runner.run(id, receiver.address));
      });
    }
  });
}
