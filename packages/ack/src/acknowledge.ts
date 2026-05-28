import type { Root, Segment } from "@glion/ast";
import { c, f, m, s } from "@glion/builder";
import { value } from "@glion/util-query";
import { Timestamp } from "@glion/util-timestamp";

import { AckCode } from "./constants";
import type { AckSuccessCode } from "./constants";
import type { AckException } from "./exception";
import { uid } from "./uid";

export interface SendingInfo {
  application: string;
  facility: string;
}

export type AcknowledgeOptions = {
  /** Custom MSH-10 control ID. Auto-generated via `uid()` when omitted. */
  id?: string;
  /** MSH-3/MSH-4 of the ACK. Defaults to the original message's MSH-5/MSH-6. */
  sending?: SendingInfo;
  /** MSH-11 processing ID. Defaults to the original message's MSH-11. */
  processingId?: string;
} & (
  | {
      /**
       * Sets the ACK code (AE/AR/CE/CR) and populates MSA-3 with the error
       * message.
       */
      error: AckException;
      /** Include ERR segment when an error is provided. Defaults to `true`. */
      includeErrSegment?: boolean;
      successCode?: never;
    }
  | {
      error?: never;
      includeErrSegment?: never;
      /**
       * MSA-1 code when no error is present. Defaults to
       * `AckCode.ApplicationAccept`.
       */
      successCode?: AckSuccessCode;
    }
);

// -- Field extraction ----

interface OriginFields {
  controlId: string;
  version: string;
  triggerEvent: string;
  processingId: string;
  sendingApp: string;
  sendingFac: string;
  receivingApp: string;
  receivingFac: string;
}

function extractOriginFields(tree: Root): OriginFields {
  return {
    controlId: value(tree, "MSH-10")?.value ?? "",
    processingId: value(tree, "MSH-11")?.value ?? "P",
    receivingApp: value(tree, "MSH-5")?.value ?? "",
    receivingFac: value(tree, "MSH-6")?.value ?? "",
    sendingApp: value(tree, "MSH-3")?.value ?? "",
    sendingFac: value(tree, "MSH-4")?.value ?? "",
    triggerEvent: value(tree, "MSH-9.2")?.value ?? "",
    version: value(tree, "MSH-12.1")?.value ?? "",
  };
}

// -- Segment builders ----

function buildMsh(
  origin: OriginFields,
  options: Pick<AcknowledgeOptions, "id" | "sending" | "processingId">
): Segment {
  const sendApp = options.sending?.application ?? origin.receivingApp;
  const sendFac = options.sending?.facility ?? origin.receivingFac;
  const pid = options.processingId ?? origin.processingId;
  const controlId = options.id ?? uid();
  const msgType = origin.triggerEvent
    ? f(c("ACK"), c(origin.triggerEvent))
    : f("ACK");

  return s(
    "MSH",
    f("|"),
    f("^~\\&"),
    f(sendApp),
    f(sendFac),
    f(origin.sendingApp),
    f(origin.sendingFac),
    f(Timestamp.now().toString()),
    f(""),
    msgType,
    f(controlId),
    f(pid),
    f(origin.version)
  );
}

function buildMsa(code: string, controlId: string, message?: string): Segment {
  return message
    ? s("MSA", f(code), f(controlId), f(message))
    : s("MSA", f(code), f(controlId));
}

// -- Public API ----

export function acknowledge(
  origin: Root,
  {
    id,
    processingId,
    sending,
    error,
    includeErrSegment = true,
    successCode = AckCode.ApplicationAccept,
  }: AcknowledgeOptions = {}
): Root {
  const fields = extractOriginFields(origin);
  const code = error?.code ?? successCode;

  const segments: Segment[] = [
    buildMsh(fields, {
      id,
      processingId,
      sending,
    }),
    buildMsa(code, fields.controlId, error?.message),
  ];

  if (error && includeErrSegment) {
    segments.push(error.toErrSegment());
  }

  return m(...segments);
}
