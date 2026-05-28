import { Hl7ErrorCode, Severity } from "../constants";
import { AckApplicationReject } from "../exception";

/**
 * Unsupported message type reject (MSA-1 = `AR`, ERR-3 = `200`, ERR-4 = `E`).
 *
 * Throw when the receiving application does not handle the inbound
 * message type (e.g. ADT^A01 sent to a system that only accepts ORU).
 */
export class UnsupportedMessageTypeReject extends AckApplicationReject {
  constructor(message: string) {
    super(message, {
      errorCode: Hl7ErrorCode.UnsupportedMessageType,
      severity: Severity.Error,
    });
    this.name = "UnsupportedMessageTypeReject";
  }
}
