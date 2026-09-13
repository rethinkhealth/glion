/**
 * The client's observable behaviour over a real socket, as scenarios: each
 * drives one `MllpClient` against a named receiver and returns what it saw.
 * Runtime-neutral, the same way as the contract cases.
 *
 * @module
 */

import { AckException } from "@glion/ack";

import { MllpClient, MllpClientError } from "../../src/index";
import type { MllpClientOptions, MllpSocket } from "../../src/index";
import { adtA01 } from "../fixtures";
import type {
  ReceiverBehaviour,
  ScenarioOutcome,
  ScenarioResult,
} from "./types";

const SHORT_TIMEOUT_MS = 300;

/** Long enough for a send to be in flight when the scenario interrupts it. */
const IN_FLIGHT_MS = 20;

export type ScenarioId =
  | "S1-three-sends"
  | "S2-split-acknowledgment"
  | "S3-silent-receiver"
  | "S4-dropped-after-read"
  | "S5-one-shot-peer"
  | "S6-refused"
  | "S7-blackhole"
  | "S8-application-reject"
  | "S9-destroy-during-send"
  | "S10-close-from-connected";

export interface Scenario {
  readonly receiver: ReceiverBehaviour;
  readonly options?: Pick<
    MllpClientOptions,
    "connectTimeoutMs" | "sendTimeoutMs"
  >;
  run(client: MllpClient): Promise<readonly ScenarioResult[]>;
}

/** One `send()`, as a result. Never rejects. */
async function attempt(client: MllpClient): Promise<ScenarioResult> {
  const { tree } = adtA01();
  try {
    const { code, controlId } = await client.send(tree);
    return { code, controlId };
  } catch (error) {
    if (error instanceof MllpClientError) {
      return { code: error.code, error: error.constructor.name };
    }
    if (error instanceof AckException) {
      return {
        code: error.code,
        controlId: error.controlId,
        error: error.constructor.name,
      };
    }
    return { error: String(error) };
  }
}

async function sends(client: MllpClient, count: number) {
  const results: ScenarioResult[] = [];
  for (let i = 0; i < count; i += 1) {
    results.push(await attempt(client));
  }
  return results;
}

function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- a timer as a promise
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export const scenarios: Readonly<Record<ScenarioId, Scenario>> = {
  "S1-three-sends": {
    receiver: "acknowledges",
    run: (client) => sends(client, 3),
  },
  "S10-close-from-connected": {
    receiver: "acknowledges",
    async run(client) {
      await client.connect();
      return [];
    },
  },
  "S2-split-acknowledgment": {
    receiver: "splitsAcknowledgment",
    run: (client) => sends(client, 1),
  },
  "S3-silent-receiver": {
    options: { sendTimeoutMs: SHORT_TIMEOUT_MS },
    receiver: "silent",
    run: (client) => sends(client, 1),
  },
  "S4-dropped-after-read": {
    receiver: "dropsAfterRead",
    run: (client) => sends(client, 1),
  },
  "S5-one-shot-peer": {
    receiver: "acknowledgesThenEnds",
    run: (client) => sends(client, 2),
  },
  "S6-refused": {
    receiver: "refuses",
    run: (client) => sends(client, 1),
  },
  "S7-blackhole": {
    options: { connectTimeoutMs: SHORT_TIMEOUT_MS },
    receiver: "blackhole",
    run: (client) => sends(client, 1),
  },
  "S8-application-reject": {
    receiver: "rejectsFirst",
    run: (client) => sends(client, 2),
  },
  "S9-destroy-during-send": {
    receiver: "silent",
    async run(client) {
      const sending = attempt(client);
      await sleep(IN_FLIGHT_MS);
      await client.destroy();
      return [await sending];
    },
  },
};

export const scenarioIds = Object.keys(scenarios) as ScenarioId[];

/** Runs scenario `id` over `socket` and returns everything it observed. */
export async function runScenario(
  id: ScenarioId,
  socket: MllpSocket
): Promise<ScenarioOutcome> {
  const scenario = scenarios[id];
  const client = new MllpClient({ socket, ...scenario.options });
  const events: string[] = [];
  client
    .on("connect", () => events.push("connect"))
    .on("disconnect", (error) =>
      events.push(`disconnect:${error?.code ?? "null"}`)
    )
    .on("close", () => events.push("close"));

  const results = await scenario.run(client);
  const stateAfterRun = client.state;
  const started = performance.now();
  await client.close();
  return {
    closeMs: performance.now() - started,
    events,
    results,
    state: client.state,
    stateAfterRun,
  };
}
