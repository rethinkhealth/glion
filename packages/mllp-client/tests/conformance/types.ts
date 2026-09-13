/**
 * The vocabulary shared by the conformance cases and every runner that
 * executes them. Types only — no runtime values, no runtime imports.
 *
 * @module
 */

import type { MllpClientState } from "../../src/index";

/** A host and port a socket under test dials. */
export interface RemoteAddress {
  readonly host: string;
  readonly port: number;
}

/**
 * How the remote system behaves for one case. The runner that hosts the
 * receiver maps each name to a loopback listener.
 *
 * - `acknowledges`: answers every message with `AA`.
 * - `rejectsFirst`: answers the first message with `AE`, every later one with
 *   `AA`.
 * - `splitsAcknowledgment`: answers `AA` in two writes 40 ms apart.
 * - `acknowledgesThenEnds`: answers `AA` and sends FIN in the same write.
 * - `endsAfterRead`: reads one message, then sends FIN without answering.
 * - `dropsAfterRead`: reads one message, then resets the connection.
 * - `silent`: accepts and never writes.
 * - `holdsOpen`: accepts, never writes, and never answers a FIN.
 * - `echoes`: writes back every byte it reads.
 * - `refuses`: nothing listens on the port.
 * - `blackhole`: an address that never answers a SYN (TEST-NET-1).
 */
export type ReceiverBehaviour =
  | "acknowledges"
  | "acknowledgesThenEnds"
  | "blackhole"
  | "dropsAfterRead"
  | "echoes"
  | "endsAfterRead"
  | "holdsOpen"
  | "refuses"
  | "rejectsFirst"
  | "silent"
  | "splitsAcknowledgment";

/** How a promise ended, or that it did not end within the guard. */
export type Settlement = "fulfilled" | "rejected" | "timeout";

/** How a read ended. */
export type ReadSettlement = "done" | "error" | "timeout" | "value";

/** What one contract case observed. Serializable. */
export type ContractOutcome = Readonly<
  Record<string, boolean | number | string>
>;

/** One `send()`: the acknowledgment, or the error it rejected with. */
export type ScenarioResult =
  | { readonly code: string; readonly controlId: string }
  | {
      readonly error: string;
      readonly code?: string;
      readonly controlId?: string;
    };

/** What one client scenario observed. Serializable. */
export interface ScenarioOutcome {
  readonly results: readonly ScenarioResult[];
  /** `connect`, `disconnect:<code|null>`, and `close`, in the order emitted. */
  readonly events: readonly string[];
  /** `client.state` after the scenario ran and before `close()`. */
  readonly stateAfterRun: MllpClientState;
  /** `client.state` after `close()`. */
  readonly state: MllpClientState;
  /** How long `close()` took, in milliseconds. */
  readonly closeMs: number;
}
