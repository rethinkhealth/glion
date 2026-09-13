/**
 * `describeMllpSocketContract`: the `MllpSocket` contract as a vitest suite
 * an adapter instantiates with its own runner.
 *
 * @module
 */

import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import type { MllpSocket } from "../../src/index";
import { contractCaseIds, contractCases } from "./contract-cases";
import type { ContractCaseId } from "./contract-cases";
import { startReceiver } from "./receiver";
import type { Receiver } from "./receiver";
import type { ContractOutcome, RemoteAddress } from "./types";

/** Where an adapter is allowed to differ. */
export interface SocketContractExpectations {
  /**
   * Upper bound on `close()` when the remote system never answers, in
   * milliseconds.
   */
  readonly closeBoundMs: number;
  /**
   * Whether the remote system sees FIN, not RST, when `close()` follows an
   * exchange.
   */
  readonly finOnClose: boolean;
}

/** Executes one case wherever the socket under test lives. */
export interface SocketContractRunner {
  readonly expects: SocketContractExpectations;
  run(id: ContractCaseId, address: RemoteAddress): Promise<ContractOutcome>;
}

/** A runner that opens the socket in this process. */
export function inProcess(
  open: (address: RemoteAddress) => MllpSocket,
  expects: SocketContractExpectations
): SocketContractRunner {
  return {
    expects,
    run: (id, address) => contractCases[id].run(open(address)),
  };
}

/** Time a graceful close may take once the remote system answers the FIN. */
const PROMPT_CLOSE_MS = 100;

/** Time for the remote system to observe the client's close. */
const SETTLE_MS = 50;

type Check = (
  outcome: ContractOutcome,
  receiver: Receiver,
  expects: SocketContractExpectations
) => void;

const checks: Readonly<Record<ContractCaseId, Check>> = {
  "C1-abort-mid-attempt": (outcome) => {
    expect(outcome).toMatchObject({ rejectedWith: "reason" });
    expect(outcome.closeMs).toBeLessThan(PROMPT_CLOSE_MS);
  },
  "C10-bytes-before-fin": (outcome) => {
    expect(outcome).toEqual({ containsAcknowledgment: true, last: "done" });
  },
  "C11-close-while-locked": (outcome, _receiver, expects) => {
    expect(outcome).toMatchObject({ close: "fulfilled" });
    expect(outcome.closeMs).toBeLessThan(expects.closeBoundMs);
  },
  "C12-large-round-trip": (outcome) => {
    expect(outcome).toEqual({
      echoed: 1024 * 1024,
      equal: true,
      last: "value",
    });
  },
  "C13-fin-on-close": (outcome, receiver, expects) => {
    expect(outcome).toEqual({ close: "fulfilled", read: "value" });
    if (expects.finOnClose) {
      expect(receiver.events).toEqual(["end"]);
    }
  },
  "C2-already-aborted": (outcome, receiver) => {
    expect(outcome).toMatchObject({ rejectedWith: "reason" });
    expect(outcome.closeMs).toBeLessThan(PROMPT_CLOSE_MS);
    expect(receiver.connections).toBe(0);
  },
  "C3-refused-leaves-nothing-open": (outcome) => {
    expect(outcome).toMatchObject({ opening: "rejected" });
    expect(outcome.closeMs).toBeLessThan(PROMPT_CLOSE_MS);
  },
  "C4-close-never-rejects": (outcome) => {
    expect(outcome).toEqual({ close: "fulfilled" });
  },
  "C5-close-idempotent": (outcome) => {
    expect(outcome).toEqual({
      after: "fulfilled",
      concurrent: "fulfilled,fulfilled,fulfilled",
    });
  },
  "C6-close-bounded-without-fin": (outcome, _receiver, expects) => {
    expect(outcome.closeMs).toBeLessThan(expects.closeBoundMs);
  },
  "C7-close-after-peer-dropped": (outcome) => {
    expect(outcome.read).not.toBe("timeout");
    expect(outcome).toMatchObject({ close: "fulfilled" });
  },
  "C8-read-settles-on-reset": (outcome) => {
    expect(["done", "error"]).toContain(outcome.read);
  },
  "C9-read-settles-on-fin": (outcome) => {
    expect(outcome).toEqual({ read: "done" });
  },
};

/**
 * Registers one test per contract case, each against its own receiver.
 *
 * `name` labels the suite. Every case runs through `runner`.
 */
export function describeMllpSocketContract(
  name: string,
  runner: SocketContractRunner
): void {
  describe(`${name} — MllpSocket contract`, () => {
    for (const id of contractCaseIds) {
      const { receiver: behaviour, rule } = contractCases[id];
      it(`${id}: ${rule}`, async () => {
        await using receiver = await startReceiver(behaviour);
        const outcome = await runner.run(id, receiver.address);
        if (id === "C13-fin-on-close") {
          await sleep(SETTLE_MS);
        }
        checks[id](outcome, receiver, runner.expects);
      });
    }
  });
}
