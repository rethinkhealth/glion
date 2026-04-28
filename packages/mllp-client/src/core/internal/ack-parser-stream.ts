/**
 * `TransformStream<DecodedMessage, Acknowledgment>` that parses each
 * decoded MLLP frame as an HL7v2 acknowledgment. Internal to
 * `@glion/mllp-client`.
 *
 * On a malformed ACK the transform errors the readable with the
 * typed `MllpClientError(MALFORMED_ACK)` from {@link parseAck}.
 * Downstream `for await ... of` consumers reject with that error;
 * `MllpClient.send()` translates it at its single catch site.
 *
 * @module
 */

import type { DecodedMessage } from "@glion/mllp-transport";

import type { Acknowledgment } from "../acknowledgment";
import { parseAck } from "../acknowledgment";

/**
 * Build a transform that consumes decoded MLLP frames and produces
 * parsed `Acknowledgment` objects. A parse failure errors the
 * readable side rather than enqueuing — the consumer's `for await`
 * loop rejects with the typed error.
 */
export function createAckParserStream(): TransformStream<
  DecodedMessage,
  Acknowledgment
> {
  return new TransformStream<DecodedMessage, Acknowledgment>({
    transform(frame, controller) {
      try {
        controller.enqueue(parseAck(frame.text));
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
