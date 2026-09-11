/**
 * MLLP client benchmarks — the full send() hot path over an in-memory wire.
 *
 * Measures clean/serialize → frame → ACK decode → correlate for the
 * persistent client, with the socket replaced by an in-memory duplex that
 * answers every frame with an AA ACK echoing MSH-10. Deterministic and
 * CPU-bound; real-socket latency is out of scope for the regression suite.
 */
import { MllpClient } from "@glion/mllp-client";
import { parseHL7v2 } from "@glion/parser";
import { bench, describe } from "vitest";

import { memorySocket } from "../fixtures/memory-wire";
import { ORU_R01_LARGE, ADT_A01_MINIMAL } from "../fixtures/messages";

// send() takes a tree, so parsing is the caller's and stays out of the
// measured block.
const small = parseHL7v2(ADT_A01_MINIMAL);
const large = parseHL7v2(ORU_R01_LARGE);

const client = new MllpClient({
  socket: memorySocket,
});
await client.connect();

describe("mllp-client", () => {
  bench("mllp-client: send small message (round-trip)", async () => {
    await client.send(small);
  });

  bench("mllp-client: send large message (round-trip)", async () => {
    await client.send(large);
  });
});
