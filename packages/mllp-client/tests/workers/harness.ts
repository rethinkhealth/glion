/**
 * The Worker that hosts `workersSocket` for the adapter tests.
 *
 * Accepts `POST /` with a {@link HarnessRequest}, drives one `MllpClient`
 * over a `workersSocket` to `host:port`, and answers with a
 * {@link HarnessOutcome} as JSON.
 *
 * @module
 */

import { AckException } from "@glion/ack";

import { MllpClient, MllpClientError } from "../../src/index";
import type { MllpClientState } from "../../src/index";
import { workersSocket } from "../../src/runtime/workers";
import { adtA01 } from "../fixtures";

export interface HarnessRequest {
  readonly host: string;
  readonly port: number;
  /** Messages to send in turn. Default 1. */
  readonly sends?: number;
  readonly sendTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  /** `connect()` instead of sending. */
  readonly connectOnly?: boolean;
}

/** One `send()`: the acknowledgment, or the error it rejected with. */
export type HarnessResult =
  | { readonly code: string; readonly controlId: string }
  | { readonly error: string; readonly code?: string };

export interface HarnessOutcome {
  readonly results: readonly HarnessResult[];
  /** `connect`, `disconnect:<code|null>`, and `close`, in the order emitted. */
  readonly events: readonly string[];
  /** `client.state` before `close()`. */
  readonly stateAfterRun: MllpClientState;
  readonly state: MllpClientState;
  /** How long `close()` took, in milliseconds. */
  readonly closeMs: number;
}

/** One `send()`, as a result. Never rejects. */
async function attempt(client: MllpClient): Promise<HarnessResult> {
  try {
    const { code, controlId } = await client.send(adtA01().tree);
    return { code, controlId };
  } catch (error) {
    if (error instanceof MllpClientError || error instanceof AckException) {
      return { code: error.code, error: error.constructor.name };
    }
    return { error: String(error) };
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const body = (await request.json()) as HarnessRequest;
    const client = new MllpClient({
      connectTimeoutMs: body.connectTimeoutMs,
      sendTimeoutMs: body.sendTimeoutMs,
      socket: workersSocket({ host: body.host, port: body.port }),
    });
    const events: string[] = [];
    client
      .on("connect", () => events.push("connect"))
      .on("disconnect", (error) =>
        events.push(`disconnect:${error?.code ?? "null"}`)
      )
      .on("close", () => events.push("close"));

    const results: HarnessResult[] = [];
    if (body.connectOnly) {
      await client.connect();
    } else {
      for (let i = 0; i < (body.sends ?? 1); i += 1) {
        results.push(await attempt(client));
      }
    }
    const stateAfterRun = client.state;
    const started = performance.now();
    await client.close();
    const outcome: HarnessOutcome = {
      closeMs: performance.now() - started,
      events,
      results,
      state: client.state,
      stateAfterRun,
    };
    return Response.json(outcome);
  },
};
