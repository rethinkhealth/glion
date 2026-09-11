/**
 * Invariant guards and option validation. An `assert*` throws only for a
 * caller's out-of-range option, or for a state the phase graph does not allow,
 * which is a bug. Expected runtime conditions are handled where they occur.
 *
 * @module
 */

import { MAX_TIMEOUT_MS } from "../constants";
import { MllpInvalidOptionError } from "../errors";
import type { MllpConnection } from "./connection";
import type { State } from "./state";

export function assertTimeoutMs(option: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new MllpInvalidOptionError(
      `${option} must be a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}.`
    );
  }
}

export function assertByteCap(bytes: number): void {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new MllpInvalidOptionError(
      "maxBufferedBytes must be a positive integer."
    );
  }
}

export function assertReconnectAttempts(attempts: number): void {
  const unbounded = attempts === Number.POSITIVE_INFINITY;
  if (!unbounded && (!Number.isInteger(attempts) || attempts < 0)) {
    throw new MllpInvalidOptionError(
      "reconnect.attempts must be a non-negative integer, or Infinity."
    );
  }
}

export function assertReconnectDelay(ms: unknown): asserts ms is number {
  if (
    typeof ms !== "number" ||
    !Number.isFinite(ms) ||
    ms < 0 ||
    ms > MAX_TIMEOUT_MS
  ) {
    throw new MllpInvalidOptionError(
      `reconnect.delay must return a number of milliseconds between 0 and ${MAX_TIMEOUT_MS}.`
    );
  }
}

/** The one phase a connection can be handed over from. */
export function assertOpening(
  current: State
): asserts current is Extract<State, { phase: "connecting" }> {
  switch (current.phase) {
    case "connecting": {
      return;
    }
    case "idle":
    case "connected":
    case "sending":
    case "closing":
    case "closed": {
      throw new Error(
        `A connection opened while the client was ${current.phase}, which its phase graph does not allow. This is a bug in @glion/mllp-client; please report it.`
      );
    }
  }
}

/** The phase `send()` writes from, once it has connected. */
export function assertConnected(
  current: State
): asserts current is Extract<State, { phase: "connected" }> {
  if (current.phase !== "connected") {
    throw new Error(
      `Cannot send: the client is ${current.phase} right after connecting, which its phase graph does not allow. This is a bug in @glion/mllp-client; please report it.`
    );
  }
}

/** The connection a client past `idle` is holding. */
export function assertConnection(
  connection: MllpConnection | null
): asserts connection is MllpConnection {
  if (connection === null) {
    throw new Error(
      "The client has a phase past idle but no connection, which its phase graph does not allow. This is a bug in @glion/mllp-client; please report it."
    );
  }
}
