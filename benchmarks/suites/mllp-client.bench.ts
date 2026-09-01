/**
 * MLLP client benchmarks — the full send() hot path over an in-memory wire.
 *
 * Measures parse → clean/serialize → frame → ACK decode → correlate for the
 * persistent client, with the socket replaced by an in-memory duplex that
 * answers every frame with an AA ACK echoing MSH-10. Deterministic and
 * CPU-bound; real-socket latency is out of scope for the regression suite.
 */
import { MllpClient } from "@glion/mllp-client";
import { bench, describe } from "vitest";

import { connectInMemory } from "../fixtures/memory-wire";
import { ORU_R01_LARGE, ADT_A01_MINIMAL } from "../fixtures/messages";

const client = new MllpClient({
  connect: connectInMemory,
  host: "in-memory",
  port: 2575,
});
await client.connect();

describe("mllp-client", () => {
  bench("mllp-client: send small message (round-trip)", async () => {
    await client.send(ADT_A01_MINIMAL);
  });

  bench("mllp-client: send large message (round-trip)", async () => {
    await client.send(ORU_R01_LARGE);
  });
});
