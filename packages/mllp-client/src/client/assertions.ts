import { MAX_TIMEOUT_MS } from "../constants";
import {
  MllpAlreadySendingError,
  MllpClientClosedError,
  MllpInvalidOptionError,
} from "../errors";
import type { MllpConnection } from "./connection";
import type { State } from "./state";

export function assertTimeoutMs(option: string, ms: number): void {
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_TIMEOUT_MS) {
    throw new MllpInvalidOptionError(
      option,
      `a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}`,
      ms
    );
  }
}

export function assertByteCap(option: string, bytes: number): void {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new MllpInvalidOptionError(option, "a positive integer", bytes);
  }
}

/** Any state a connection attempt can start from, join, or is done in. */
export function assertReadyToConnect(current: State) {
  switch (current.phase) {
    case "idle":
    case "connecting":
    case "connected":
    case "sending": {
      return;
    }
    case "closing": {
      throw new MllpClientClosedError();
    }
    case "closed": {
      throw new MllpClientClosedError();
    }
    // This should never happen if all phases are covered above.
    default: {
      throw new Error(`Unexpected state phase.`);
    }
  }
}

/** The one phase a connection can be handed over from. */
export function assertConnecting(
  current: State
): asserts current is Extract<State, { phase: "connecting" }> {
  switch (current.phase) {
    case "connecting": {
      return;
    }
    case "closing": {
      throw new MllpClientClosedError();
    }
    case "closed": {
      throw new MllpClientClosedError();
    }
    case "idle":
    case "connected":
    case "sending": {
      throw new Error(
        `A connection opened while the client was ${current.phase}, which its phase graph does not allow. This is a bug in @glion/mllp-client; please report it.`
      );
    }
  }
}

/** The one phase a message can be written from. */
export function assertReadyToSend(
  current: State
): asserts current is Extract<State, { phase: "connected" }> {
  switch (current.phase) {
    case "connected": {
      return;
    }
    case "sending": {
      throw new MllpAlreadySendingError(current.controlId);
    }
    case "closing": {
      throw new MllpClientClosedError();
    }
    case "closed": {
      throw new MllpClientClosedError();
    }
    case "idle":
    case "connecting": {
      // send() awaits connect(), which settles only once the phase has moved
      // past both.
      throw new Error(
        `Cannot send: the client is ${current.phase}, which its phase graph does not allow after connecting. This is a bug in @glion/mllp-client; please report it.`
      );
    }
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
